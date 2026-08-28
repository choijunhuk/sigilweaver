import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { CameraGestureSource } from '../../gesture/cameraSource';
import { ButtonGestureSource } from '../../gesture/source';
import type { GestureSource } from '../../gesture/source';
import type { GestureEvent } from '../../gesture/filter';
import type { GestureConfig, Sigil } from '../../gesture/types';
import { CombatWorld, FIELD_H } from '../../combat/world';
import { WaveSpawner } from '../../combat/spawner';
import { loadContent, type CombatContent } from '../../combat/content';
import { RuneEngine } from '../../combat/runes';
import { PhraseMatcher } from '../../gesture/phrases';
import { EventBus } from '../../core/events';
import { Rng } from '../../core/rng';
import { initAudio, sfx, startBgm, setCombatLayer } from '../../core/audio';
import { warn } from '../../core/log';
import type { RuneDef } from '../../data/schemas';

const SIGIL_LABEL: Record<Sigil, string> = {
  BOLT: '☝', WARD: '✊', PULSE: '🖐', ARC: '✌', FOCUS: '🤏', NONE: '',
};

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const SPLIT_Y = GAME_HEIGHT * (2 / 3); // battlefield height == FIELD_H

/** One combat arena: gestures cast spells, enemies approach, survive. */
export class GameScene extends Phaser.Scene {
  private camSource: CameraGestureSource | null = null;
  private buttonSource = new ButtonGestureSource();
  private world!: CombatWorld;
  private spawner!: WaveSpawner;
  private bus!: EventBus;
  private gfx!: Phaser.GameObjects.Graphics;
  private feedbackGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private castText!: Phaser.GameObjects.Text;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private disposers: (() => void)[] = [];
  private hitstopUntil = 0;
  private startedAt = 0;
  private focusActive = false;
  private content!: CombatContent;
  private matcher!: PhraseMatcher;
  private runeEngine!: RuneEngine;
  private runCfg!: GestureConfig;
  private rng!: Rng;
  private nextRuneAt = 8; // kills until next rune choice
  private phraseText!: Phaser.GameObjects.Text;
  private tokenText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    initAudio();
    startBgm();
    setCombatLayer(true);

    this.content = loadContent();
    const { spells, enemies, phrases } = this.content;
    this.bus = new EventBus();
    this.rng = new Rng((Date.now() % 100000) + 1);
    this.world = new CombatWorld(spells, enemies, this.rng, this.bus);
    this.spawner = new WaveSpawner(this.world, this.rng);
    this.matcher = new PhraseMatcher(phrases);
    this.runeEngine = new RuneEngine(this.world, this.bus);
    this.nextRuneAt = 8;
    this.startedAt = this.time.now;

    if (!this.textures.exists('spark')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('spark', 8, 8);
      g.destroy();
    }
    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 220 },
      lifespan: 450,
      scale: { start: 1, end: 0 },
      emitting: false,
    });

    this.gfx = this.add.graphics();
    this.add.rectangle(GAME_WIDTH / 2, SPLIT_Y, GAME_WIDTH, 2, 0x2a2f45);
    this.feedbackGfx = this.add.graphics();

    this.hudText = this.add.text(14, 10, '', {
      fontFamily: 'monospace', fontSize: '22px', color: '#cdd6f4',
    });
    this.castText = this.add
      .text(GAME_WIDTH / 2, SPLIT_Y - 90, '', {
        fontFamily: 'monospace', fontSize: '64px', color: '#7c6cff',
      })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 28, '', {
        fontFamily: 'monospace', fontSize: '20px', color: '#8891ab',
      })
      .setOrigin(0.5);
    this.phraseText = this.add
      .text(GAME_WIDTH / 2, SPLIT_Y * 0.3, '', {
        fontFamily: 'monospace', fontSize: '44px', color: '#f5c26b',
      })
      .setOrigin(0.5);
    this.tokenText = this.add
      .text(GAME_WIDTH / 2, SPLIT_Y + 26, '', {
        fontFamily: 'monospace', fontSize: '24px', color: '#8891ab',
      })
      .setOrigin(0.5);

    this.wireCombatFeedback();

    // input sources — per-run copy so grammar runes can tune it live (§7)
    const cfg = this.registry.get('gestureConfig') as GestureConfig;
    this.runCfg = { ...cfg };
    this.camSource = new CameraGestureSource(this.runCfg);
    this.wireSource(this.camSource);
    this.wireSource(this.buttonSource);
    this.camSource.start().catch((e) => {
      warn('cv', 'camera unavailable, button input only', e);
      this.camSource = null;
      this.statusText.setText('카메라 없음 — 키 1~5 (디버그)');
    });

    const sigils: Exclude<Sigil, 'NONE'>[] = ['BOLT', 'WARD', 'PULSE', 'ARC', 'FOCUS'];
    sigils.forEach((sigil, i) => {
      this.input.keyboard?.on(`keydown-${'ONE TWO THREE FOUR FIVE'.split(' ')[i]}`, () =>
        this.buttonSource.press(sigil),
      );
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private wireSource(source: GestureSource): void {
    this.disposers.push(source.onGesture((ev) => this.onGesture(ev)));
  }

  private wireCombatFeedback(): void {
    const b = this.bus;
    this.disposers.push(
      b.on('onSpellHit', ({ x, y }) => {
        sfx.hit();
        this.particles.emitParticleAt(this.fx(x), this.fy(y), 3);
      }),
      b.on('onEnemyDeath', ({ x, y }) => {
        sfx.enemyDeath();
        this.particles.emitParticleAt(this.fx(x), this.fy(y), 14);
        this.hitstopUntil = this.time.now + 55; // §13 히트스톱
        if (navigator.vibrate) navigator.vibrate(20);
        if (this.world.kills >= this.nextRuneAt && this.world.player.alive) {
          this.nextRuneAt += 12;
          this.time.delayedCall(400, () => this.offerRunes());
        }
      }),
      b.on('onWardBlock', ({ x, y }) => {
        sfx.wardBlock();
        this.particles.emitParticleAt(this.fx(x), this.fy(y), 6);
      }),
      b.on('onPlayerHit', () => {
        sfx.playerHit();
        this.cameras.main.shake(110, 0.006);
        this.cameras.main.flash(90, 255, 60, 60, false);
        if (navigator.vibrate) navigator.vibrate(60);
      }),
      b.on('onPlayerDeath', () => this.endRun()),
    );
  }

  private onGesture(ev: GestureEvent): void {
    if (ev.sigil === 'FOCUS') {
      this.focusActive = true;
    } else {
      const ok = this.world.cast(ev.sigil);
      if (ok) sfx.cast(ev.sigil);
    }
    this.castText.setText(SIGIL_LABEL[ev.sigil]);
    if (navigator.vibrate) navigator.vibrate(15);
    this.time.delayedCall(500, () => this.castText.setText(''));

    // §6: sigil also feeds the phrase token buffer
    const phrase = this.matcher.push(ev.sigil, this.time.now);
    if (phrase && this.world.castPhrase(phrase.id, phrase.manaCost)) {
      sfx.phrase();
      if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
      this.cameras.main.shake(140, 0.004);
      this.phraseText.setText(`✦ ${phrase.name} ✦`);
      this.time.delayedCall(1200, () => this.phraseText.setText(''));
    }
  }

  private offerRunes(): void {
    const pool = this.content.runes.filter(
      (r) => !this.runeEngine.acquired.some((a) => a.id === r.id),
    );
    if (pool.length === 0) return;
    const picks: RuneDef[] = [];
    while (picks.length < Math.min(3, pool.length)) {
      const r = pool[Math.min(pool.length - 1, Math.floor(this.rng.next() * pool.length))];
      if (!picks.includes(r)) picks.push(r);
    }
    this.scene.pause();
    this.scene.launch('Reward', {
      runes: picks,
      onPick: (rune: RuneDef) => {
        this.runeEngine.add(rune);
        // grammar runes reach into the live gesture config (§7 문법 룬)
        const base = this.registry.get('gestureConfig') as GestureConfig;
        this.runCfg.stableFrames = Math.max(
          2,
          base.stableFrames + this.runeEngine.gestureMods.stableFramesDelta,
        );
        if (this.runeEngine.gestureMods.phraseGapMs) {
          this.matcher.maxGapMs = this.runeEngine.gestureMods.phraseGapMs;
        }
      },
    });
  }

  update(_time: number, delta: number): void {
    // focus channel follows the held pose (hysteresis keeps candidate stable)
    if (this.focusActive && this.camSource?.snapshot.candidate !== 'FOCUS') {
      this.focusActive = false;
    }
    this.world.setFocusHeld(this.focusActive);

    if (this.time.now >= this.hitstopUntil) {
      const dt = Math.min(delta, 50);
      this.world.update(dt);
      this.spawner.update();
    }

    // enemy mix ramps over the run (§9 난이도 곡선)
    const sec = (this.time.now - this.startedAt) / 1000;
    if (sec > 75) this.spawner.mix = ['crawler', 'crawler', 'lobber', 'shellback'];
    else if (sec > 35) this.spawner.mix = ['crawler', 'crawler', 'lobber'];

    // token buffer + phrase hint (§12)
    const toks = this.matcher.tokens.map((t) => SIGIL_LABEL[t]).join(' ');
    const hint = this.matcher.hints(this.time.now)[0];
    this.tokenText.setText(
      toks ? `${toks}${hint ? `  →  ${hint.name}` : ''}` : '',
    );

    this.draw();
    this.drawFeedback();
    this.drawHud();
  }

  // battlefield -> screen mapping (1:1 in x, field fills top 2/3)
  private fx(x: number): number {
    return x;
  }
  private fy(y: number): number {
    return y * (SPLIT_Y / FIELD_H);
  }

  private draw(): void {
    const g = this.gfx;
    const w = this.world;
    g.clear();

    // player: neon sigil circle
    const px = this.fx(w.player.x);
    const py = this.fy(w.player.y);
    g.lineStyle(3, 0x7c6cff, 1);
    g.strokeCircle(px, py, 26);
    g.lineStyle(1, 0x7c6cff, 0.4);
    g.strokeCircle(px, py, 34);
    if (this.focusActive) {
      g.lineStyle(2, 0xf5c26b, 0.8);
      g.strokeCircle(px, py, 42);
    }
    // ward shield
    if (w.t < w.player.wardUntil) {
      g.lineStyle(5, 0x5dd8ff, 0.9);
      g.strokeCircle(px, py, 52);
    }

    // enemies
    for (const e of w.aliveEnemies) {
      const ex = this.fx(e.x);
      const ey = this.fy(e.y);
      const color = Phaser.Display.Color.HexStringToColor(e.def.color).color;
      const alpha = e.state === 'stagger' ? 0.5 : 1;
      g.lineStyle(3, color, alpha);
      g.strokeCircle(ex, ey, e.def.radius);
      g.fillStyle(0x000000, 0.6);
      g.fillCircle(ex, ey, e.def.radius - 2);
      // hp sliver
      const hpw = (e.hp / e.def.hp) * e.def.radius * 2;
      g.fillStyle(color, 0.9);
      g.fillRect(ex - e.def.radius, ey - e.def.radius - 8, hpw, 3);
      // windup telegraph: expanding warning ring (§4)
      if (e.state === 'windup') {
        const p = 1 - (e.stateUntil - w.t) / e.def.windupMs;
        g.lineStyle(3, 0xffb020, 0.5 + 0.5 * p);
        g.strokeCircle(ex, ey, e.def.radius + 14 + 10 * (1 - p));
      }
      if (e.shieldUp) {
        g.lineStyle(4, 0xaaaaaa, 0.9);
        g.beginPath();
        g.arc(ex, ey, e.def.radius + 6, Math.PI * 0.15, Math.PI * 0.85);
        g.strokePath();
      }
    }

    // projectiles + AOE telegraphs
    for (const p of w.projectiles) {
      if (!p.alive) continue;
      if (p.aoe) {
        const prog = 1 - (p.aoe.at - w.t) / 1500;
        g.lineStyle(2, 0xff5d5d, 0.7);
        g.strokeCircle(this.fx(p.aoe.tx), this.fy(p.aoe.ty), p.aoe.radius);
        g.fillStyle(0xff5d5d, 0.15 + 0.2 * Math.max(0, prog));
        g.fillCircle(this.fx(p.aoe.tx), this.fy(p.aoe.ty), p.aoe.radius * Math.max(0, prog));
        continue;
      }
      const color = p.friendly ? 0xffa940 : 0xff5d5d;
      g.fillStyle(color, 1);
      g.fillCircle(this.fx(p.x), this.fy(p.y), p.radius * 0.7);
      g.lineStyle(1, color, 0.35);
      g.strokeCircle(this.fx(p.x), this.fy(p.y), p.radius * 1.4);
    }
  }

  private drawFeedback(): void {
    const g = this.feedbackGfx;
    g.clear();
    if (!this.camSource) return;
    const snap = this.camSource.snapshot;
    if (!snap.landmarks) {
      this.statusText.setText(snap.handSeen ? '' : '손을 보여주세요');
      return;
    }
    this.statusText.setText(snap.candidate !== 'NONE' ? SIGIL_LABEL[snap.candidate] : '');
    const zoneH = GAME_HEIGHT - SPLIT_Y;
    const px = (i: number) => (1 - snap.landmarks![i].x) * GAME_WIDTH;
    const py = (i: number) => SPLIT_Y + snap.landmarks![i].y * zoneH;
    g.lineStyle(3, 0x7c6cff, 0.85);
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      g.moveTo(px(a), py(a));
      g.lineTo(px(b), py(b));
    }
    g.strokePath();
    if (snap.progress > 0) {
      g.lineStyle(5, 0xf5c26b, 1);
      g.beginPath();
      g.arc(px(0), py(0), 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * snap.progress);
      g.strokePath();
    }
  }

  private drawHud(): void {
    const w = this.world;
    const g = this.gfx;
    // hp / mana bars
    g.fillStyle(0x1a1f2e, 1);
    g.fillRect(14, 44, 220, 10);
    g.fillStyle(0xff5d5d, 1);
    g.fillRect(14, 44, 220 * Math.max(0, w.player.hp / w.player.maxHp), 10);
    g.fillStyle(0x1a1f2e, 1);
    g.fillRect(14, 60, 220, 8);
    g.fillStyle(0x5d9bff, 1);
    g.fillRect(14, 60, 220 * (w.player.mana / w.player.manaMax), 8);

    const sec = Math.floor((this.time.now - this.startedAt) / 1000);
    this.hudText.setText(`⚔ ${w.kills}   ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
  }

  private endRun(): void {
    setCombatLayer(false);
    const sec = Math.floor((this.time.now - this.startedAt) / 1000);
    this.registry.set('lastRun', { kills: this.world.kills, seconds: sec });
    this.time.delayedCall(900, () => this.scene.start('Result'));
  }

  private teardown(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.camSource?.stop();
    this.camSource = null;
  }
}

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { CameraGestureSource } from '../../gesture/cameraSource';
import { ButtonGestureSource } from '../../gesture/source';
import type { GestureSource } from '../../gesture/source';
import type { GestureEvent } from '../../gesture/filter';
import type { GestureConfig, Sigil } from '../../gesture/types';
import { CombatWorld, FIELD_H } from '../../combat/world';
import { RoomController } from '../../combat/rooms';
import { loadContent, type CombatContent } from '../../combat/content';
import { RuneEngine } from '../../combat/runes';
import { PhraseMatcher } from '../../gesture/phrases';
import { EventBus } from '../../core/events';
import { Rng } from '../../core/rng';
import { initAudio, sfx, startBgm, setCombatLayer } from '../../core/audio';
import { warn } from '../../core/log';
import { loadSave, updateSave } from '../../meta/save';
import type { EventEffect, RuneDef } from '../../data/schemas';
import { VfxSystem } from '../vfx';

const COLOR = {
  fire: 0xff8c42, lightning: 0x9be8ff, arcane: 0x7c6cff, ward: 0x5dd8ff,
};

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

const SPLIT_Y = GAME_HEIGHT * (2 / 3);
const ROOM_LABEL: Record<string, string> = {
  combat: '전투', event: '이변', boss: '침묵의 서기관',
};

type Flow = 'tutorial' | 'banner' | 'room' | 'paused' | 'rest' | 'over';

/** One full chapter run: rooms, rewards, events, boss (§4 Core Loop). */
export class GameScene extends Phaser.Scene {
  private camSource: CameraGestureSource | null = null;
  private buttonSource = new ButtonGestureSource();
  private world!: CombatWorld;
  private rooms!: RoomController;
  private bus!: EventBus;
  private content!: CombatContent;
  private matcher!: PhraseMatcher;
  private runeEngine!: RuneEngine;
  private runCfg!: GestureConfig;
  private rng!: Rng;
  private flow: Flow = 'banner';
  private hitstopUntil = 0;
  private startedAt = 0;
  private focusActive = false;
  private haptics = true;

  private gfx!: Phaser.GameObjects.Graphics;
  private feedbackGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private castText!: Phaser.GameObjects.Text;
  private phraseText!: Phaser.GameObjects.Text;
  private tokenText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private sealText!: Phaser.GameObjects.Text;
  private vfx!: VfxSystem;
  private dmgTexts: Phaser.GameObjects.Text[] = [];
  private disposers: (() => void)[] = [];
  private seal: { tokens: string[]; deadline: number } | null = null;
  private tutorialStep = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    initAudio();
    startBgm();

    this.content = loadContent();
    this.bus = new EventBus();
    this.rng = new Rng((Date.now() % 100000) + 1);
    this.world = new CombatWorld(this.content.spells, this.content.enemies, this.rng, this.bus);
    this.rooms = new RoomController(
      this.world, this.content.stage, new Rng(this.rng.int(1, 99999)), this.bus, this.content.phrases,
    );
    this.matcher = new PhraseMatcher(this.content.phrases);
    this.runeEngine = new RuneEngine(this.world, this.bus);
    this.startedAt = this.time.now;

    const save = loadSave();
    this.haptics = save.settings.haptics;

    this.buildDisplay();
    this.wireCombatFeedback();

    // per-run gesture config copy; 여유로운 손 + grammar runes tune it live
    const base = this.registry.get('gestureConfig') as GestureConfig;
    this.runCfg = { ...base };
    if (save.settings.relaxedHands) {
      this.runCfg.stableFrames += 2;
      this.matcher.maxGapMs = 4000;
    }
    this.camSource = new CameraGestureSource(this.runCfg);
    this.wireSource(this.camSource);
    this.wireSource(this.buttonSource);
    this.camSource.start().catch((e) => {
      warn('cv', 'camera unavailable, button input only', e);
      this.camSource = null;
      this.statusText.setText('카메라 없음 — 키 1~5 (보조 입력)');
    });

    const sigils: Exclude<Sigil, 'NONE'>[] = ['BOLT', 'WARD', 'PULSE', 'ARC', 'FOCUS'];
    sigils.forEach((sigil, i) => {
      this.input.keyboard?.on(`keydown-${'ONE TWO THREE FOUR FIVE'.split(' ')[i]}`, () =>
        this.buttonSource.press(sigil),
      );
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    if (!save.tutorialDone) this.startTutorial();
    else this.nextRoomWithBanner();
  }

  // ── setup ────────────────────────────────────────────────────────────────
  private buildDisplay(): void {
    this.gfx = this.add.graphics();
    this.vfx = new VfxSystem(this);
    this.add.rectangle(GAME_WIDTH / 2, SPLIT_Y, GAME_WIDTH, 2, 0x2a2f45);
    this.feedbackGfx = this.add.graphics();

    const mono = (size: number, color: string) => ({
      fontFamily: 'monospace', fontSize: `${size}px`, color,
    });
    this.hudText = this.add.text(14, 10, '', mono(22, '#cdd6f4'));
    this.castText = this.add.text(GAME_WIDTH / 2, SPLIT_Y - 90, '', mono(64, '#7c6cff')).setOrigin(0.5);
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 28, '', mono(20, '#8891ab')).setOrigin(0.5);
    this.phraseText = this.add.text(GAME_WIDTH / 2, SPLIT_Y * 0.32, '', mono(44, '#f5c26b')).setOrigin(0.5);
    this.tokenText = this.add.text(GAME_WIDTH / 2, SPLIT_Y + 26, '', mono(24, '#8891ab')).setOrigin(0.5);
    this.bannerText = this.add.text(GAME_WIDTH / 2, SPLIT_Y * 0.45, '', mono(40, '#e0def4')).setOrigin(0.5);
    this.sealText = this.add.text(GAME_WIDTH / 2, 150, '', mono(36, '#c084fc')).setOrigin(0.5);

    for (let i = 0; i < 12; i++) {
      this.dmgTexts.push(
        this.add.text(0, 0, '', mono(20, '#ffd27d')).setOrigin(0.5).setVisible(false),
      );
    }
  }

  private wireSource(source: GestureSource): void {
    this.disposers.push(source.onGesture((ev) => this.onGesture(ev)));
  }

  private wireCombatFeedback(): void {
    const b = this.bus;
    this.disposers.push(
      b.on('onSpellHit', ({ x, y, damage, spellTags }) => {
        if (spellTags.includes('status')) return;
        sfx.hit();
        const color = spellTags.includes('lightning')
          ? COLOR.lightning
          : spellTags.includes('fire')
            ? COLOR.fire
            : COLOR.arcane;
        this.vfx.impact(this.fx(x), this.fy(y), color);
        this.popDamage(x, y, damage);
      }),
      b.on('onEnemyDeath', ({ x, y, kind }) => {
        sfx.enemyDeath();
        const def = this.content.enemies.get(kind);
        const color = def
          ? Phaser.Display.Color.HexStringToColor(def.color).color
          : COLOR.arcane;
        this.vfx.burst(this.fx(x), this.fy(y), color, kind === 'mute_scribe' ? 60 : 16);
        this.hitstopUntil = this.time.now + 55;
        this.vibrate(20);
      }),
      b.on('onWardBlock', ({ x, y }) => {
        sfx.wardBlock();
        this.vfx.impact(this.fx(x), this.fy(y), COLOR.ward, 6);
        this.vfx.shockwave(this.fx(x), this.fy(y), 46, COLOR.ward, 3);
      }),
      b.on('onLightning', ({ x1, y1, x2, y2 }) => {
        this.vfx.lightning(this.fx(x1), this.fy(y1), this.fx(x2), this.fy(y2));
      }),
      b.on('onExplosion', ({ x, y, radius }) => {
        this.vfx.explosion(this.fx(x), this.fy(y), radius * 0.83);
        this.cameras.main.shake(90, 0.003);
      }),
      b.on('onSpellCast', ({ sigil, x, y }) => {
        if (sigil === 'PULSE') {
          this.vfx.shockwave(
            this.fx(x), this.fy(y), this.world.spells.pulse.radius * 0.83, COLOR.arcane,
          );
        } else if (sigil === 'BOLT') {
          this.vfx.impact(this.fx(x), this.fy(y) - 20, COLOR.fire, 3);
        }
      }),
      b.on('onPlayerHit', () => {
        sfx.playerHit();
        this.cameras.main.shake(110, 0.006);
        this.cameras.main.flash(90, 255, 60, 60, false);
        this.vibrate(60);
      }),
      b.on('onPlayerDeath', () => this.endRun(false)),
      b.on('onRoomCleared', () => this.onRoomCleared()),
      b.on('onRunCleared', () => this.endRun(true)),
      b.on('onBossSeal', ({ tokens, deadlineMs }) => {
        this.seal = { tokens, deadline: this.time.now + deadlineMs };
        sfx.phrase();
      }),
      b.on('onBossSealBroken', () => {
        this.seal = null;
        this.sealText.setText('');
        this.phraseText.setText('✦ 봉인 파훼! ✦');
        const bossE = this.world.aliveEnemies.find((e) => e.def.id === 'mute_scribe');
        if (bossE) {
          this.vfx.explosion(this.fx(bossE.x), this.fy(bossE.y), 160, 0xc084fc);
          this.vfx.shockwave(this.fx(bossE.x), this.fy(bossE.y), 420, 0xc084fc, 8);
        }
        this.cameras.main.flash(160, 192, 132, 252, false);
        this.vibrate([50, 40, 100]);
        this.time.delayedCall(1200, () => this.phraseText.setText(''));
      }),
      b.on('onBossSealFailed', () => {
        this.seal = null;
        this.sealText.setText('');
        this.cameras.main.shake(220, 0.012);
      }),
    );
  }

  // ── flow ─────────────────────────────────────────────────────────────────
  private startTutorial(): void {
    this.flow = 'tutorial';
    this.tutorialStep = 0;
    setCombatLayer(false);
    this.showTutorialStep();
  }

  private showTutorialStep(): void {
    const steps: [string, string][] = [
      ['☝', '검지만 펴서 Bolt 발사'],
      ['✊', '주먹을 쥐어 Ward 방어막'],
      ['🖐', '손바닥을 펴서 Pulse 파동'],
    ];
    if (this.tutorialStep >= steps.length) {
      updateSave((s) => { s.tutorialDone = true; });
      this.bannerText.setText('');
      this.nextRoomWithBanner();
      return;
    }
    const [icon, text] = steps[this.tutorialStep];
    this.bannerText.setText(`${icon}  ${text}`);
  }

  private nextRoomWithBanner(): void {
    const upcoming = this.rooms.nextRoom;
    if (!upcoming) return;
    this.flow = 'banner';
    const n = this.rooms.index + 2; // 1-based, about to start
    this.bannerText.setText(`방 ${n}/${this.rooms.totalRooms} — ${ROOM_LABEL[upcoming.type]}`);
    setCombatLayer(false);
    this.time.delayedCall(2200, () => {
      this.bannerText.setText('');
      const room = this.rooms.startNextRoom();
      if (!room) return;
      if (room.type === 'event') {
        this.openEvent();
      } else {
        this.flow = 'room';
        setCombatLayer(true);
      }
    });
  }

  private onRoomCleared(): void {
    if (this.flow !== 'room') return; // event rooms clear instantly; ignore
    this.flow = 'rest';
    setCombatLayer(false);
    const room = this.rooms.room;
    if (room?.type === 'combat') {
      this.time.delayedCall(600, () => this.offerRunes());
    } else {
      this.rest();
    }
  }

  /** §3: 웨이브 사이 손 내리는 휴지 구간 */
  private rest(): void {
    this.flow = 'rest';
    this.bannerText.setText('정화됨 — 손을 내려도 좋다');
    this.time.delayedCall(2800, () => {
      this.bannerText.setText('');
      this.nextRoomWithBanner();
    });
  }

  private offerRunes(): void {
    const pool = this.content.runes.filter(
      (r) => !this.runeEngine.acquired.some((a) => a.id === r.id),
    );
    if (pool.length === 0) return this.rest();
    const picks: RuneDef[] = [];
    while (picks.length < Math.min(3, pool.length)) {
      const r = pool[this.rng.int(0, pool.length - 1)];
      if (!picks.includes(r)) picks.push(r);
    }
    this.flow = 'paused';
    this.scene.pause();
    this.scene.launch('Reward', {
      runes: picks,
      onPick: (rune: RuneDef) => {
        this.applyRune(rune);
        this.rest();
      },
    });
  }

  private applyRune(rune: RuneDef): void {
    this.runeEngine.add(rune);
    const base = this.registry.get('gestureConfig') as GestureConfig;
    const relaxed = loadSave().settings.relaxedHands ? 2 : 0;
    this.runCfg.stableFrames = Math.max(
      2, base.stableFrames + relaxed + this.runeEngine.gestureMods.stableFramesDelta,
    );
    if (this.runeEngine.gestureMods.phraseGapMs) {
      this.matcher.maxGapMs = Math.max(this.matcher.maxGapMs, this.runeEngine.gestureMods.phraseGapMs);
    }
  }

  private openEvent(): void {
    const event = this.content.events[this.rng.int(0, this.content.events.length - 1)];
    this.flow = 'paused';
    this.scene.pause();
    this.scene.launch('Event', {
      event,
      onPick: (effect: EventEffect) => {
        this.applyEventEffect(effect);
        this.rest();
      },
    });
  }

  private applyEventEffect(effect: EventEffect): void {
    const p = this.world.player;
    switch (effect.type) {
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + effect.amount);
        break;
      case 'maxHp':
        p.maxHp += effect.amount;
        p.hp += effect.amount;
        break;
      case 'manaMax':
        p.manaMax += effect.amount;
        break;
      case 'damageMult':
        this.world.mods.damageMult *= effect.mult;
        break;
      case 'hurtRune': {
        p.hp = Math.max(1, p.hp - effect.damage);
        const pool = this.content.runes.filter(
          (r) => !this.runeEngine.acquired.some((a) => a.id === r.id),
        );
        if (pool.length) this.applyRune(pool[this.rng.int(0, pool.length - 1)]);
        break;
      }
    }
  }

  private endRun(victory: boolean): void {
    if (this.flow === 'over') return;
    this.flow = 'over';
    setCombatLayer(false);
    const sec = Math.floor((this.time.now - this.startedAt) / 1000);
    const roomsReached = this.rooms.index + 1;
    updateSave((s) => {
      s.bestKills = Math.max(s.bestKills, this.world.kills);
      s.bestRoom = Math.max(s.bestRoom, roomsReached);
      if (victory) s.cleared = true;
    });
    this.registry.set('lastRun', {
      kills: this.world.kills, seconds: sec, rooms: roomsReached,
      total: this.rooms.totalRooms, victory,
      runes: this.runeEngine.acquired.map((r) => r.name),
    });
    this.time.delayedCall(victory ? 1600 : 900, () => this.scene.start('Result'));
  }

  // ── input ────────────────────────────────────────────────────────────────
  private onGesture(ev: GestureEvent): void {
    this.castText.setText(SIGIL_LABEL[ev.sigil]);
    this.vibrate(15);
    this.time.delayedCall(500, () => this.castText.setText(''));

    if (this.flow === 'tutorial') {
      const expect: Sigil[] = ['BOLT', 'WARD', 'PULSE'];
      if (ev.sigil === expect[this.tutorialStep]) {
        sfx.cast(ev.sigil);
        this.world.cast(ev.sigil);
        this.tutorialStep++;
        this.showTutorialStep();
      }
      return;
    }
    if (this.flow !== 'room') return;

    if (ev.sigil === 'FOCUS') {
      this.focusActive = true;
    } else {
      const ok = this.world.cast(ev.sigil);
      if (ok) sfx.cast(ev.sigil);
    }
    const phrase = this.matcher.push(ev.sigil, this.time.now);
    if (phrase && this.world.castPhrase(phrase.id, phrase.manaCost)) {
      sfx.phrase();
      this.vibrate([40, 40, 80]);
      this.cameras.main.shake(140, 0.004);
      this.phraseText.setText(`✦ ${phrase.name} ✦`);
      this.time.delayedCall(1200, () => this.phraseText.setText(''));
    }
  }

  private vibrate(pattern: number | number[]): void {
    if (this.haptics && navigator.vibrate) navigator.vibrate(pattern);
  }

  // ── frame ────────────────────────────────────────────────────────────────
  update(_time: number, delta: number): void {
    if (
      this.focusActive &&
      !this.camSource?.snapshot.hands.some((h) => h.candidate === 'FOCUS')
    ) {
      this.focusActive = false;
    }
    this.world.setFocusHeld(this.focusActive && this.flow === 'room');

    if (this.flow === 'room' && this.time.now >= this.hitstopUntil) {
      const dt = Math.min(delta, 50);
      this.world.update(dt);
      this.rooms.update();
    }

    const toks = this.matcher.tokens.map((t) => SIGIL_LABEL[t]).join(' ');
    const hint = this.matcher.hints(this.time.now)[0];
    this.tokenText.setText(toks ? `${toks}${hint ? `  →  ${hint.name}` : ''}` : '');

    if (this.seal) {
      const left = Math.max(0, (this.seal.deadline - this.time.now) / 1000);
      const icons = this.seal.tokens.map((t) => SIGIL_LABEL[t as Sigil]).join(' → ');
      this.sealText.setText(`봉인 문장  ${icons}   ${left.toFixed(1)}s`);
    }

    this.vfx.update(delta);
    this.draw();
    this.drawFeedback();
    this.drawHud();
  }

  private fx(x: number): number { return x; }
  private fy(y: number): number { return y * (SPLIT_Y / FIELD_H); }

  private popDamage(x: number, y: number, damage: number): void {
    const t = this.dmgTexts.find((d) => !d.visible);
    if (!t) return;
    t.setText(String(Math.round(damage)))
      .setPosition(this.fx(x) + this.rng.int(-12, 12), this.fy(y) - 16)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: t, y: t.y - 44, alpha: 0, duration: 550,
      onComplete: () => t.setVisible(false),
    });
  }

  private draw(): void {
    const g = this.gfx;
    const w = this.world;
    g.clear();

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
    if (w.t < w.player.wardUntil) {
      g.lineStyle(5, 0x5dd8ff, 0.9);
      g.strokeCircle(px, py, 52);
    }

    for (const e of w.aliveEnemies) {
      const ex = this.fx(e.x);
      const ey = this.fy(e.y);
      const color = Phaser.Display.Color.HexStringToColor(e.def.color).color;
      const alpha = e.state === 'stagger' ? 0.5 : 1;
      const boss = e.def.id === 'mute_scribe';
      g.lineStyle(boss ? 4 : 3, color, alpha);
      g.strokeCircle(ex, ey, e.def.radius);
      g.fillStyle(0x000000, 0.6);
      g.fillCircle(ex, ey, e.def.radius - 2);
      if (e.statuses.has('burn')) {
        g.lineStyle(2, 0xff8c42, 0.8);
        g.strokeCircle(ex, ey, e.def.radius + 4);
      }
      if (e.statuses.has('shock')) {
        g.lineStyle(2, 0x5dd8ff, 0.8);
        g.strokeCircle(ex, ey, e.def.radius + 8);
      }
      if (!boss) {
        const hpw = (e.hp / e.def.hp) * e.def.radius * 2;
        g.fillStyle(color, 0.9);
        g.fillRect(ex - e.def.radius, ey - e.def.radius - 8, Math.max(0, hpw), 3);
      }
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

    for (const p of w.projectiles) {
      if (!p.alive) continue;
      if (p.aoe) {
        const prog = 1 - (p.aoe.at - w.t) / 1800;
        g.lineStyle(2, 0xff5d5d, 0.7);
        g.strokeCircle(this.fx(p.aoe.tx), this.fy(p.aoe.ty), p.aoe.radius);
        g.fillStyle(0xff5d5d, 0.12 + 0.2 * Math.max(0, prog));
        g.fillCircle(this.fx(p.aoe.tx), this.fy(p.aoe.ty), p.aoe.radius * Math.max(0, Math.min(1, prog)));
        continue;
      }
      const color = p.friendly ? 0xffa940 : 0xff5d5d;
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(this.fx(p.x), this.fy(p.y), p.radius * 0.4);
      g.fillStyle(color, 0.8);
      g.fillCircle(this.fx(p.x), this.fy(p.y), p.radius * 0.7);
      g.lineStyle(1, color, 0.35);
      g.strokeCircle(this.fx(p.x), this.fy(p.y), p.radius * 1.4);
      if (p.friendly) {
        this.vfx.trail(this.fx(p.x), this.fy(p.y), p.tags.includes('fire') ? COLOR.fire : COLOR.arcane);
      }
    }

    // boss hp bar
    const bossE = w.aliveEnemies.find((e) => e.def.id === 'mute_scribe');
    if (bossE) {
      g.fillStyle(0x1a1f2e, 1);
      g.fillRect(60, 84, GAME_WIDTH - 120, 12);
      g.fillStyle(0xc084fc, 1);
      g.fillRect(60, 84, (GAME_WIDTH - 120) * Math.max(0, bossE.hp / bossE.def.hp), 12);
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
    for (const hand of snap.hands) this.drawOneHand(g, hand);
  }

  /** bbox-fit one hand into the feedback zone so the silhouette stays readable
   *  regardless of camera distance; x anchor follows the mirrored hand position. */
  private drawOneHand(
    g: Phaser.GameObjects.Graphics,
    hand: { landmarks: { x: number; y: number }[]; progress: number },
  ): void {
    const zoneH = GAME_HEIGHT - SPLIT_Y;
    const lm = hand.landmarks;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const bw = Math.max(0.02, maxX - minX);
    const bh = Math.max(0.02, maxY - minY);
    const scale = Math.min((zoneH * 0.72) / bh, (GAME_WIDTH * 0.4) / bw);
    const cx = (1 - (minX + maxX) / 2) * GAME_WIDTH;
    const cy = SPLIT_Y + zoneH * 0.52;
    const lx = (i: number) => cx + ((minX + maxX) / 2 - lm[i].x) * scale;
    const ly = (i: number) => cy + (lm[i].y - (minY + maxY) / 2) * scale;

    g.lineStyle(3, 0x7c6cff, 0.85);
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      g.moveTo(lx(a), ly(a));
      g.lineTo(lx(b), ly(b));
    }
    g.strokePath();
    if (hand.progress > 0) {
      g.lineStyle(5, 0xf5c26b, 1);
      g.beginPath();
      g.arc(lx(0), ly(0), 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hand.progress);
      g.strokePath();
    }
  }

  private drawHud(): void {
    const w = this.world;
    const g = this.gfx;
    g.fillStyle(0x1a1f2e, 1);
    g.fillRect(14, 44, 220, 10);
    g.fillStyle(0xff5d5d, 1);
    g.fillRect(14, 44, 220 * Math.max(0, w.player.hp / w.player.maxHp), 10);
    g.fillStyle(0x1a1f2e, 1);
    g.fillRect(14, 60, 220, 8);
    g.fillStyle(0x5d9bff, 1);
    g.fillRect(14, 60, 220 * (w.player.mana / w.player.manaMax), 8);

    const sec = Math.floor((this.time.now - this.startedAt) / 1000);
    const roomN = Math.max(1, this.rooms.index + 1);
    this.hudText.setText(
      `방 ${roomN}/${this.rooms.totalRooms}  ⚔ ${w.kills}  ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
    );
  }

  private teardown(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.camSource?.stop();
    this.camSource = null;
  }
}

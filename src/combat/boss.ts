import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { PhraseDef } from '../data/schemas';
import type { Enemy } from './types';
import { FIELD_W, type CombatWorld } from './world';

const SEAL_WINDOW_MS = 9000;
const SEAL_FAIL_DAMAGE = 25;
const STAGGER_WINDOW_MS = 4500;

/**
 * 침묵의 서기관 (§8): 3 phases, periodic "봉인 문장" — the player must cast the
 * shown phrase in time to break the seal and open a x2 damage window; failing
 * detonates a field-wide blast (ward-blockable). The boss fight is a gesture
 * fluency exam by design.
 */
export class BossController {
  readonly boss: Enemy;
  phase = 1;
  seal: { phrase: PhraseDef; deadline: number } | null = null;
  /** while > world.t the boss takes x2 damage and does not act */
  vulnerableUntil = 0;
  private nextSealAt: number;
  private nextSummonAt: number;
  defeated = false;

  constructor(
    private world: CombatWorld,
    private bus: EventBus,
    private rng: Rng,
    private phrases: PhraseDef[],
  ) {
    this.boss = world.spawn('mute_scribe', FIELD_W / 2, 130);
    this.nextSealAt = world.t + 12_000;
    this.nextSummonAt = world.t + 5_000;
    this.bus.on('onPhraseCompleted', ({ phraseId }) => this.onPhrase(phraseId));
  }

  private phaseOf(): number {
    const r = this.boss.hp / this.boss.def.hp;
    return r > 0.66 ? 1 : r > 0.33 ? 2 : 3;
  }

  update(): void {
    const w = this.world;
    if (this.defeated) return;
    if (!this.boss.alive) {
      this.defeated = true;
      return;
    }

    const p = this.phaseOf();
    if (p !== this.phase) {
      this.phase = p;
      this.bus.emit('onBossPhase', { phase: p });
      this.nextSealAt = Math.min(this.nextSealAt, w.t + 3000);
    }

    // vulnerable window: boss holds still, takes double damage (handled via mods)
    if (w.t < this.vulnerableUntil) return;

    // seal mechanic
    if (this.seal) {
      if (w.t >= this.seal.deadline) {
        this.seal = null;
        this.bus.emit('onBossSealFailed', {});
        // field-wide blast — ward blocks it (§8 via hitPlayer path)
        this.world.bossBlast(SEAL_FAIL_DAMAGE);
        this.scheduleNextSeal();
      }
    } else if (w.t >= this.nextSealAt) {
      const phrase = this.phrases[Math.floor(this.rng.next() * this.phrases.length)];
      this.seal = { phrase, deadline: w.t + SEAL_WINDOW_MS };
      this.bus.emit('onBossSeal', { tokens: phrase.tokens, deadlineMs: SEAL_WINDOW_MS });
    }

    // summons
    if (w.t >= this.nextSummonAt) {
      const interval = this.phase === 1 ? 9000 : this.phase === 2 ? 7000 : 5500;
      this.nextSummonAt = w.t + interval;
      w.spawn('crawler', 80 + this.rng.next() * (FIELD_W - 160), 60, 800);
      if (this.phase >= 2) w.spawn('lobber', 80 + this.rng.next() * (FIELD_W - 160), 40, 800);
      if (this.phase >= 3) w.spawn('crawler', 80 + this.rng.next() * (FIELD_W - 160), 60, 800);
    }
  }

  private onPhrase(phraseId: string): void {
    if (!this.seal || this.defeated) return;
    if (this.seal.phrase.id !== phraseId) return;
    this.seal = null;
    this.vulnerableUntil = this.world.t + STAGGER_WINDOW_MS;
    this.world.stagger(this.boss);
    this.boss.stateUntil = this.world.t + STAGGER_WINDOW_MS;
    // §8: seal break opens a x2 damage window ('vulnerable' handled in damage())
    this.world.applyStatus(this.boss, 'vulnerable', STAGGER_WINDOW_MS);
    this.bus.emit('onBossSealBroken', {});
    this.scheduleNextSeal();
  }

  private scheduleNextSeal(): void {
    const interval = this.phase === 3 ? 14_000 : 18_000;
    this.nextSealAt = this.world.t + interval;
  }
}

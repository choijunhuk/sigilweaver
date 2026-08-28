import type { CombatWorld } from './world';
import type { Rng } from '../core/rng';

/**
 * Budget-based continuous spawner (§9): budget per tick grows over time,
 * spends it on the given enemy mix.
 */
export class WaveSpawner {
  private nextSpawnAt = 800;

  constructor(
    private world: CombatWorld,
    private rng: Rng,
    /** enemy kinds to draw from, weighted by repetition; scene may swap it live */
    public mix: string[] = ['crawler'],
    /** spawn interval range [startMs, floorMs]; ramps down over rampMs */
    private startMs = 2200,
    private floorMs = 800,
    private rampMs = 150_000,
  ) {}

  update(): void {
    const t = this.world.t;
    if (t < this.nextSpawnAt) return;
    const ramp = Math.min(1, t / this.rampMs);
    const interval = this.startMs - (this.startMs - this.floorMs) * ramp;
    this.nextSpawnAt = t + interval;
    this.world.spawn(this.rng.pick(this.mix));
  }
}

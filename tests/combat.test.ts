import { describe, expect, it, vi } from 'vitest';
import { CombatWorld } from '../src/combat/world';
import { loadContent } from '../src/combat/content';
import { EventBus } from '../src/core/events';
import { Rng } from '../src/core/rng';

const TICK = 1000 / 60;

function makeWorld(seed = 1) {
  const { spells, enemies } = loadContent();
  const bus = new EventBus();
  return { world: new CombatWorld(spells, enemies, new Rng(seed), bus), bus };
}

function run(world: CombatWorld, ms: number, each?: () => void): void {
  for (let t = 0; t < ms; t += TICK) {
    world.update(TICK);
    each?.();
  }
}

describe('CombatWorld', () => {
  it('bolt projectile kills a crawler', () => {
    const { world, bus } = makeWorld();
    const death = vi.fn();
    bus.on('onEnemyDeath', death);
    world.spawn('crawler', world.player.x, world.player.y - 300);
    // 20hp / 10dmg = 2 bolts
    world.cast('BOLT');
    run(world, 400);
    world.cast('BOLT');
    run(world, 600);
    expect(death).toHaveBeenCalledTimes(1);
    expect(world.kills).toBe(1);
  });

  it('crawler telegraphs (1.5s windup) before hitting the player', () => {
    const { world } = makeWorld();
    world.spawn('crawler', world.player.x, world.player.y - 30); // already in range
    run(world, 1000);
    expect(world.player.hp).toBe(100); // still winding up — §4 telegraph absorbs latency
    run(world, 800);
    expect(world.player.hp).toBe(90);
  });

  it('ward blocks the strike', () => {
    const { world, bus } = makeWorld();
    const block = vi.fn();
    bus.on('onWardBlock', block);
    world.spawn('crawler', world.player.x, world.player.y - 30);
    run(world, 1300); // deep into windup
    world.cast('WARD'); // 0.8s shield covers the strike landing at ~1.5s
    run(world, 400);
    expect(world.player.hp).toBe(100);
    expect(block).toHaveBeenCalled();
  });

  it('pulse knocks enemies back and cancels windup', () => {
    const { world } = makeWorld();
    const e = world.spawn('crawler', world.player.x, world.player.y - 40);
    run(world, 700); // windup started
    expect(e.state).toBe('windup');
    const yBefore = e.y;
    world.cast('PULSE');
    run(world, 500);
    expect(e.state).not.toBe('windup');
    expect(e.y).toBeLessThan(yBefore - 30); // pushed away (up)
    run(world, 2000);
    expect(world.player.hp).toBe(100); // windup was cancelled, no free hit
  });

  it('arc costs mana and hits the nearest enemy instantly', () => {
    const { world } = makeWorld();
    const e = world.spawn('crawler', world.player.x, world.player.y - 200);
    const manaBefore = world.player.mana;
    expect(world.cast('ARC')).toBe(true);
    expect(world.player.mana).toBeLessThan(manaBefore);
    expect(e.hp).toBe(e.def.hp - world.spells.arc.damage);
  });

  it('focus channel regenerates mana faster', () => {
    const { world } = makeWorld();
    world.player.mana = 0;
    world.setFocusHeld(false);
    run(world, 1000);
    const passive = world.player.mana;
    world.player.mana = 0;
    world.setFocusHeld(true);
    run(world, 1000);
    expect(world.player.mana).toBeGreaterThan(passive * 5);
  });

  it('player dies and world emits onPlayerDeath once', () => {
    const { world, bus } = makeWorld();
    const death = vi.fn();
    bus.on('onPlayerDeath', death);
    world.player.hp = 5;
    world.spawn('crawler', world.player.x, world.player.y - 30);
    run(world, 6000);
    expect(world.player.alive).toBe(false);
    expect(death).toHaveBeenCalledTimes(1);
  });

  it('is deterministic for the same seed', () => {
    const a = makeWorld(42);
    const b = makeWorld(42);
    for (const w of [a.world, b.world]) {
      w.spawn('crawler');
      w.spawn('crawler');
      w.cast('BOLT');
      run(w, 3000);
    }
    expect(a.world.aliveEnemies.map((e) => [e.x, e.y, e.hp])).toEqual(
      b.world.aliveEnemies.map((e) => [e.x, e.y, e.hp]),
    );
  });

  it('object pool reuses dead slots', () => {
    const { world } = makeWorld();
    for (let i = 0; i < 30; i++) {
      const e = world.spawn('crawler', 100, 100);
      world.damage(e, 999, ['test'], null);
    }
    expect(world.enemies.length).toBe(1); // one slot recycled 30 times
  });
});

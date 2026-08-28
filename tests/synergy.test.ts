import { describe, expect, it, vi } from 'vitest';
import { CombatWorld } from '../src/combat/world';
import { RuneEngine } from '../src/combat/runes';
import { loadContent } from '../src/combat/content';
import { EventBus } from '../src/core/events';
import { Rng } from '../src/core/rng';

const TICK = 1000 / 60;
const content = loadContent();

function makeWorld(seed = 1) {
  const bus = new EventBus();
  const world = new CombatWorld(content.spells, content.enemies, new Rng(seed), bus);
  const runes = new RuneEngine(world, bus);
  return { world, bus, runes };
}

function rune(id: string) {
  const r = content.runes.find((r) => r.id === id);
  if (!r) throw new Error(`missing rune ${id}`);
  return r;
}

function run(world: CombatWorld, ms: number): void {
  for (let t = 0; t < ms; t += TICK) world.update(TICK);
}

describe('rune hooks & synergy chains (§7)', () => {
  it('burning_touch: fire hits apply burn that ticks damage', () => {
    const { world, runes } = makeWorld();
    runes.add(rune('burning_touch'));
    const e = world.spawn('crawler', world.player.x, world.player.y - 200);
    world.cast('BOLT'); // fire tag
    run(world, 400); // projectile hits
    expect(e.statuses.has('burn')).toBe(true);
    const hpAfterHit = e.hp;
    run(world, 1000);
    expect(e.hp).toBeLessThan(hpAfterHit); // dot ticking
  });

  it('burn -> death explosion -> shock -> double arc damage (full chain)', () => {
    const { world, runes } = makeWorld();
    runes.add(rune('burning_touch'));
    runes.add(rune('detonating_end'));
    runes.add(rune('static_charge'));

    const a = world.spawn('crawler', 300, 300);
    const b = world.spawn('crawler', 340, 300); // within explosion radius of a

    world.applyStatus(a, 'burn', 3000, 4);
    world.damage(a, 999, ['fire'], null); // dies burning -> explodes
    expect(b.statuses.has('shock')).toBe(true); // explosion applied shock

    const hpBefore = b.hp;
    world.player.mana = 60;
    // put b nearest and arc it: shocked -> x2 damage
    world.cast('ARC');
    const dealt = hpBefore - b.hp;
    expect(dealt).toBe(content.spells.arc.damage * 2);
  });

  it('resolute_ward reflects blocked melee back at the attacker', () => {
    const { world, runes } = makeWorld();
    runes.add(rune('resolute_ward'));
    const e = world.spawn('crawler', world.player.x, world.player.y - 30);
    run(world, 1400); // windup in progress
    world.cast('WARD');
    run(world, 300); // strike lands into ward
    expect(world.player.hp).toBe(100);
    expect(e.hp).toBeLessThan(e.def.hp); // took reflected damage
  });

  it('grammar runes report gesture mods without touching combat', () => {
    const { runes } = makeWorld();
    runes.add(rune('fluent_hand'));
    runes.add(rune('extended_sentence'));
    expect(runes.gestureMods.stableFramesDelta).toBe(-1);
    expect(runes.gestureMods.phraseGapMs).toBe(4000);
  });

  it('vitality heals and raises max hp on acquire', () => {
    const { world, runes } = makeWorld();
    world.player.hp = 50;
    runes.add(rune('vitality'));
    expect(world.player.maxHp).toBe(125);
    expect(world.player.hp).toBe(75);
  });

  it('deep_well raises mana cap', () => {
    const { world, runes } = makeWorld();
    runes.add(rune('deep_well'));
    expect(world.player.manaMax).toBe(90);
  });
});

describe('phrases in combat (§6)', () => {
  it('thunderstorm strikes over 3 seconds and costs mana', () => {
    const { world, bus } = makeWorld();
    const done = vi.fn();
    bus.on('onPhraseCompleted', done);
    for (let i = 0; i < 6; i++) world.spawn('crawler', 100 + i * 90, 200);
    const totalHp = () => world.aliveEnemies.reduce((s, e) => s + e.hp, 0);
    const before = totalHp();
    expect(world.castPhrase('thunderstorm', 30)).toBe(true);
    expect(world.player.mana).toBe(30);
    run(world, 3200);
    expect(before - totalHp()).toBeGreaterThanOrEqual(8 * 12 * 0.5); // strikes landed
    expect(done).toHaveBeenCalled();
  });

  it('fire_lance pierces through a line and burns', () => {
    const { world } = makeWorld();
    const a = world.spawn('crawler', world.player.x, world.player.y - 150);
    const b = world.spawn('crawler', world.player.x, world.player.y - 350);
    world.castPhrase('fire_lance', 25);
    run(world, 800);
    expect(a.hp).toBeLessThan(a.def.hp);
    expect(b.hp).toBeLessThan(b.def.hp); // pierced through
    expect(b.statuses.has('burn') || !b.alive).toBe(true);
  });

  it('phrase fails without mana', () => {
    const { world } = makeWorld();
    world.player.mana = 5;
    expect(world.castPhrase('thunderstorm', 30)).toBe(false);
  });
});

describe('new enemies (§8)', () => {
  it('lobber holds range and its telegraphed AOE hits a stationary player', () => {
    const { world } = makeWorld();
    world.spawn('lobber', world.player.x, world.player.y - 380);
    run(world, 2000); // telegraph 1.5s then detonation
    expect(world.player.hp).toBeLessThan(100);
  });

  it('shellback blocks frontal bolts until pulsed', () => {
    const { world } = makeWorld();
    const e = world.spawn('shellback', world.player.x, world.player.y - 150);
    world.cast('BOLT');
    run(world, 400);
    expect(e.hp).toBe(e.def.hp); // shield blocked
    world.cast('PULSE'); // stagger drops shield (§8)
    expect(e.shieldUp).toBe(false);
    world.update(TICK);
    world.cast('BOLT');
    run(world, 400);
    expect(e.hp).toBeLessThan(e.def.hp);
  });
});

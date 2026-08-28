import { describe, expect, it, vi } from 'vitest';
import { CombatWorld } from '../src/combat/world';
import { RoomController } from '../src/combat/rooms';
import { loadContent } from '../src/combat/content';
import { EventBus } from '../src/core/events';
import { Rng } from '../src/core/rng';

const TICK = 1000 / 60;
const content = loadContent();

function makeRun(seed = 7) {
  const bus = new EventBus();
  const world = new CombatWorld(content.spells, content.enemies, new Rng(seed), bus);
  const rooms = new RoomController(world, content.stage, new Rng(seed + 1), bus, content.phrases);
  return { world, rooms, bus };
}

/** god-mode auto play: kill everything instantly, never die */
function autoClear(world: CombatWorld, rooms: RoomController, maxMs: number): void {
  for (let t = 0; t < maxMs && rooms.phase === 'fighting'; t += TICK) {
    world.player.hp = world.player.maxHp;
    world.update(TICK);
    rooms.update();
    for (const e of world.aliveEnemies) world.damage(e, 500, ['test'], null);
  }
}

describe('RoomController (§9 run structure)', () => {
  it('chapter1 has 8 rooms ending in a boss', () => {
    expect(content.stage.rooms).toHaveLength(8);
    expect(content.stage.rooms[7].type).toBe('boss');
  });

  it('combat room spends its budget then clears when field is empty', () => {
    const { world, rooms, bus } = makeRun();
    const cleared = vi.fn();
    bus.on('onRoomCleared', cleared);
    const room = rooms.startNextRoom();
    expect(room?.type).toBe('combat');
    autoClear(world, rooms, 120_000);
    expect(cleared).toHaveBeenCalledWith({ index: 0 });
    expect(rooms.phase).toBe('cleared');
  });

  it('event room clears immediately (scene drives the choice)', () => {
    const { rooms } = makeRun();
    rooms.startNextRoom(); // 0 combat
    rooms.startNextRoom(); // 1 combat
    const room = rooms.startNextRoom(); // 2 event
    expect(room?.type).toBe('event');
    expect(rooms.phase).toBe('cleared');
  });

  it('full run: clearing every room reaches onRunCleared', () => {
    const { world, rooms, bus } = makeRun();
    const runCleared = vi.fn();
    bus.on('onRunCleared', runCleared);
    // break every seal instantly so the boss dies quickly in god-mode
    bus.on('onBossSeal', () => {
      const seal = rooms.boss!.seal!;
      world.player.mana = 999;
      world.castPhrase(seal.phrase.id, 0);
    });
    for (let i = 0; i < content.stage.rooms.length; i++) {
      rooms.startNextRoom();
      autoClear(world, rooms, 240_000);
      expect(rooms.phase).not.toBe('fighting');
    }
    expect(runCleared).toHaveBeenCalled();
  });
});

describe('BossController (§8 침묵의 서기관)', () => {
  function makeBossFight() {
    const { world, rooms, bus } = makeRun();
    // jump straight to boss room
    while (rooms.nextRoom && rooms.nextRoom.type !== 'boss') rooms.index++;
    rooms.startNextRoom();
    return { world, rooms, bus, boss: rooms.boss! };
  }

  it('emits a seal with phrase tokens and punishes failure with a blast', () => {
    const { world, rooms, bus } = makeBossFight();
    const seal = vi.fn();
    const failed = vi.fn();
    const hit = vi.fn();
    bus.on('onBossSeal', seal);
    bus.on('onBossSealFailed', failed);
    bus.on('onPlayerHit', hit);
    for (let t = 0; t < 25_000; t += TICK) {
      world.player.hp = 100; // keep alive so world-time keeps advancing
      world.update(TICK);
      rooms.update();
    }
    expect(seal).toHaveBeenCalled();
    expect(failed).toHaveBeenCalled(); // never answered
    expect(hit).toHaveBeenCalled(); // blast / boss attacks landed
  });

  it('casting the sealed phrase breaks it and doubles damage taken', () => {
    const { world, rooms, bus, boss } = makeBossFight();
    const broken = vi.fn();
    bus.on('onBossSealBroken', broken);
    // survive to first seal
    for (let t = 0; t < 15_000 && !boss.seal; t += TICK) {
      world.player.hp = 100;
      world.update(TICK);
      rooms.update();
    }
    expect(boss.seal).not.toBeNull();
    world.player.mana = 999;
    world.castPhrase(boss.seal!.phrase.id, 0);
    expect(broken).toHaveBeenCalled();
    expect(boss.boss.statuses.has('vulnerable')).toBe(true);

    const hpBefore = boss.boss.hp;
    world.damage(boss.boss, 10, ['test'], null);
    expect(hpBefore - boss.boss.hp).toBe(20); // x2 window
  });

  it('boss phases advance as hp drops', () => {
    const { world, rooms, bus, boss } = makeBossFight();
    const phase = vi.fn();
    bus.on('onBossPhase', phase);
    boss.boss.hp = boss.boss.def.hp * 0.5; // into phase 2
    world.update(TICK);
    rooms.update();
    expect(phase).toHaveBeenCalledWith({ phase: 2 });
  });
});

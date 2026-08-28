import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { PhraseDef, RoomDef, StageDef } from '../data/schemas';
import { BossController } from './boss';
import type { CombatWorld } from './world';

export type RoomPhase = 'idle' | 'fighting' | 'cleared' | 'done';

/**
 * Drives one chapter run (§9): a sequence of combat / event / boss rooms in a
 * single persistent CombatWorld. The scene decides what happens BETWEEN rooms
 * (rewards, event choices, rest); this controls what happens inside them.
 */
export class RoomController {
  index = -1;
  phase: RoomPhase = 'idle';
  boss: BossController | null = null;
  private budgetLeft = 0;
  private nextSpawnAt = 0;
  private eliteSpawned = false;

  constructor(
    private world: CombatWorld,
    private stage: StageDef,
    private rng: Rng,
    private bus: EventBus,
    private phrases: PhraseDef[],
  ) {}

  get room(): RoomDef | null {
    return this.stage.rooms[this.index] ?? null;
  }
  get totalRooms(): number {
    return this.stage.rooms.length;
  }

  /** Peek the upcoming room without starting it (scene shows banners/UI). */
  get nextRoom(): RoomDef | null {
    return this.stage.rooms[this.index + 1] ?? null;
  }

  startNextRoom(): RoomDef | null {
    this.index++;
    const room = this.room;
    if (!room) {
      this.phase = 'done';
      return null;
    }
    this.phase = 'fighting';
    this.eliteSpawned = false;
    if (room.type === 'combat') {
      this.budgetLeft = room.budget;
      this.nextSpawnAt = this.world.t + 600;
    } else if (room.type === 'boss') {
      this.boss = new BossController(this.world, this.bus, this.rng, this.phrases);
    } else {
      // event rooms have no combat — scene shows the choice UI and calls roomCleared()
      this.phase = 'cleared';
    }
    this.bus.emit('onRoomStarted', { index: this.index, type: room.type });
    return room;
  }

  update(): void {
    const room = this.room;
    if (!room || this.phase !== 'fighting') return;

    if (room.type === 'combat') {
      // elite room: one big shellback up front (§9)
      if (room.elite && !this.eliteSpawned) {
        this.eliteSpawned = true;
        const e = this.world.spawn('shellback', undefined, 140, 900);
        e.hp *= 3;
        this.budgetLeft -= e.def.cost;
      }
      if (this.budgetLeft > 0 && this.world.t >= this.nextSpawnAt) {
        const kind = this.rng.pick(room.mix);
        // in-field materialize spawn — telegraphed appearance (§4)
        const e = this.world.spawn(kind, undefined, 60 + this.rng.next() * 200, 800);
        this.budgetLeft -= e.def.cost;
        // spawn pacing tightens as the room drains
        const p = this.budgetLeft / room.budget;
        this.nextSpawnAt = this.world.t + 700 + 1300 * p;
      }
      if (this.budgetLeft <= 0 && this.world.aliveEnemies.length === 0) {
        this.clearRoom();
      }
    } else if (room.type === 'boss' && this.boss) {
      this.boss.update();
      if (this.boss.defeated && this.world.aliveEnemies.length === 0) {
        this.clearRoom();
        this.phase = 'done';
        this.bus.emit('onRunCleared', {});
      }
    }
  }

  private clearRoom(): void {
    this.phase = 'cleared';
    this.bus.emit('onRoomCleared', { index: this.index });
  }
}

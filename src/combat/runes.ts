import type { EventBus } from '../core/events';
import type { RuneAction, RuneDef } from '../data/schemas';
import type { CombatWorld } from './world';
import type { Enemy } from './types';
import { log } from '../core/log';

/** Gesture-side effects a grammar rune requests; applied by the scene (§7). */
export interface GestureMods {
  stableFramesDelta: number;
  phraseGapMs: number | null;
}

/**
 * Rune hook executor (§7): runes are pure data; this subscribes their hooks
 * to the EventBus and merges static mods into the world.
 */
export class RuneEngine {
  readonly acquired: RuneDef[] = [];
  readonly gestureMods: GestureMods = { stableFramesDelta: 0, phraseGapMs: null };
  private disposers: (() => void)[] = [];

  constructor(
    private world: CombatWorld,
    private bus: EventBus,
  ) {}

  add(rune: RuneDef): void {
    this.acquired.push(rune);
    log('combat', 'rune acquired:', rune.id);

    if (rune.mods) {
      const m = this.world.mods;
      if (rune.mods.boltPierce) m.boltPierce += rune.mods.boltPierce;
      if (rune.mods.boltSplit) m.boltSplit = true;
      if (rune.mods.arcChains) m.arcChains += rune.mods.arcChains;
      if (rune.mods.wardReflect) m.wardReflect = true;
      if (rune.mods.shockOnExplosion) m.shockOnExplosion = true;
      if (rune.mods.damageMult) m.damageMult *= rune.mods.damageMult;
      if (rune.mods.focusBonus) m.focusBonus += rune.mods.focusBonus;
      if (rune.mods.manaMaxBonus) {
        m.manaMaxBonus += rune.mods.manaMaxBonus;
        this.world.player.manaMax += rune.mods.manaMaxBonus;
      }
    }

    if (rune.gesture) {
      if (rune.gesture.stableFramesDelta) {
        this.gestureMods.stableFramesDelta += rune.gesture.stableFramesDelta;
      }
      if (rune.gesture.phraseGapMs) this.gestureMods.phraseGapMs = rune.gesture.phraseGapMs;
    }

    for (const hook of rune.hooks ?? []) {
      if (hook.trigger === 'onAcquire') {
        this.execute(hook.action, null, 0, 0);
        continue;
      }
      if (hook.trigger === 'onSpellHit') {
        this.disposers.push(
          this.bus.on('onSpellHit', ({ spellTags, enemyId, x, y }) => {
            if (hook.condition?.spellTag && !spellTags.includes(hook.condition.spellTag)) return;
            if (spellTags.includes('status')) return; // dots don't re-trigger hooks
            const enemy = this.findEnemy(enemyId);
            if (hook.condition?.status && !enemy?.statuses.has(hook.condition.status)) return;
            this.execute(hook.action, enemy, x, y);
          }),
        );
      } else if (hook.trigger === 'onEnemyDeath') {
        this.disposers.push(
          this.bus.on('onEnemyDeath', ({ enemyId, kind, x, y }) => {
            if (hook.condition?.enemyKind && kind !== hook.condition.enemyKind) return;
            const enemy = this.findEnemy(enemyId, true);
            if (hook.condition?.status && !enemy?.statuses.has(hook.condition.status)) return;
            this.execute(hook.action, null, x, y);
          }),
        );
      } else if (hook.trigger === 'onWardBlock') {
        this.disposers.push(
          this.bus.on('onWardBlock', ({ x, y }) => this.execute(hook.action, null, x, y)),
        );
      }
    }
  }

  private findEnemy(id: number, includeDead = false): Enemy | null {
    return this.world.enemies.find((e) => e.id === id && (includeDead || e.alive)) ?? null;
  }

  private execute(action: RuneAction, enemy: Enemy | null, x: number, y: number): void {
    switch (action.type) {
      case 'applyStatus':
        if (enemy) this.world.applyStatus(enemy, action.status, action.durationMs, action.dps);
        break;
      case 'explode':
        this.world.explode(x, y, action.radius, action.damage, action.tags);
        break;
      case 'heal': {
        const p = this.world.player;
        if (action.maxHpBonus) p.maxHp += action.maxHpBonus;
        p.hp = Math.min(p.maxHp, p.hp + action.amount);
        break;
      }
    }
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}

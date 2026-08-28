import type { Sigil } from '../gesture/types';

/** All cross-system events flow through this map. Add events here, typed. */
export interface EventMap {
  onGestureRecognized: { sigil: Sigil; confidence: number; at: number };
  onSceneChanged: { scene: string };
  // combat
  onSpellCast: { sigil: Sigil; x: number; y: number };
  onSpellHit: { spellTags: string[]; enemyId: number; x: number; y: number; damage: number };
  onEnemyDeath: { kind: string; enemyId: number; x: number; y: number };
  onEnemySpawn: { kind: string; enemyId: number };
  onPlayerHit: { damage: number; hp: number };
  onPlayerDeath: Record<string, never>;
  onWardBlock: { x: number; y: number };
  onStatusApplied: { status: string; enemyId: number };
  onPhraseCompleted: { phraseId: string };
  onManaChanged: { mana: number; max: number };
  // run structure
  onRoomStarted: { index: number; type: string };
  onRoomCleared: { index: number };
  onRunCleared: Record<string, never>;
  // boss (침묵의 서기관 §8)
  onBossSeal: { tokens: string[]; deadlineMs: number };
  onBossSealBroken: Record<string, never>;
  onBossSealFailed: Record<string, never>;
  onBossPhase: { phase: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) (h as Handler<EventMap[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

import type { EnemyDef } from '../data/schemas';

export interface Vec2 {
  x: number;
  y: number;
}

export type EnemyState = 'move' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface StatusInstance {
  /** world-time ms when it expires */
  until: number;
  dps?: number;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  hp: number;
  state: EnemyState;
  /** world-time ms when current state ends */
  stateUntil: number;
  attackReadyAt: number;
  knockX: number;
  knockY: number;
  statuses: Map<string, StatusInstance>;
  /** shellback: shield dropped while staggered */
  shieldUp: boolean;
  alive: boolean;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  friendly: boolean;
  pierce: number;
  tags: string[];
  alive: boolean;
  /** enemy AOE lob: explodes at target after telegraph (world-time ms) */
  aoe?: { tx: number; ty: number; at: number; radius: number };
  /** applied to enemies this projectile damages */
  applyStatus?: { status: string; durationMs: number; dps?: number };
}

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  manaMax: number;
  /** world-time ms until ward is active */
  wardUntil: number;
  focusHeld: boolean;
  alive: boolean;
}

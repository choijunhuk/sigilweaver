import { z } from 'zod';

/** Gesture recognition thresholds (§15). Loaded from data/config/gesture.json. */
export const GestureConfigSchema = z.object({
  curlBent: z.number().min(0).max(1),
  curlStraight: z.number().min(0).max(1),
  pinchMax: z.number().positive(),
  vSpreadMin: z.number().positive(),
  stableFrames: z.number().int().min(1).max(10),
  minConfidence: z.number().min(0).max(1),
  releaseConfidence: z.number().min(0).max(1),
  debounceMs: z.number().min(0),
});

export type GestureConfigData = z.infer<typeof GestureConfigSchema>;

/** Spell tuning (data/config/spells.json). */
export const SpellConfigSchema = z.object({
  bolt: z.object({
    damage: z.number().positive(),
    speed: z.number().positive(),
    cooldownMs: z.number().nonnegative(),
    radius: z.number().positive(),
  }),
  ward: z.object({
    durationMs: z.number().positive(),
    cooldownMs: z.number().nonnegative(),
  }),
  pulse: z.object({
    damage: z.number().nonnegative(),
    radius: z.number().positive(),
    knockback: z.number().positive(),
    cooldownMs: z.number().nonnegative(),
  }),
  arc: z.object({
    damage: z.number().positive(),
    manaCost: z.number().nonnegative(),
    cooldownMs: z.number().nonnegative(),
    chains: z.number().int().nonnegative(),
    chainRange: z.number().positive(),
  }),
  focus: z.object({ manaPerSec: z.number().positive() }),
  mana: z.object({ max: z.number().positive(), regenPerSec: z.number().nonnegative() }),
});
export type SpellConfig = z.infer<typeof SpellConfigSchema>;

/** Enemy archetype (data/enemies/*.json). */
export const EnemySchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().positive(),
  speed: z.number().nonnegative(),
  radius: z.number().positive(),
  touchRange: z.number().positive(),
  windupMs: z.number().min(1000),
  attackDamage: z.number().nonnegative(),
  attackCooldownMs: z.number().nonnegative(),
  /** spawn budget cost for wave generation (§9) */
  cost: z.number().positive(),
  color: z.string(),
  /** ranged attacker: stop at range and lob telegraphed projectiles */
  ranged: z
    .object({
      range: z.number().positive(),
      projectileDamage: z.number().positive(),
      telegraphMs: z.number().min(1000),
      cooldownMs: z.number().positive(),
      aoeRadius: z.number().positive(),
    })
    .optional(),
  /** front shield: immune to frontal damage unless staggered (shellback) */
  frontShield: z.boolean().optional(),
});
export type EnemyDef = z.infer<typeof EnemySchema>;

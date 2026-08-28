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

const SigilToken = z.enum(['BOLT', 'WARD', 'PULSE', 'ARC', 'FOCUS']);

/** Sigil phrase (data/phrases.json). 2-3 tokens (§6). */
export const PhraseSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokens: z.array(SigilToken).min(2).max(3),
  manaCost: z.number().nonnegative(),
});
export type PhraseDef = z.infer<typeof PhraseSchema>;
export const PhraseListSchema = z.array(PhraseSchema).min(1);

/** Rune hook actions — the small executor vocabulary (§7). */
const RuneActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('applyStatus'),
    status: z.enum(['burn', 'shock']),
    durationMs: z.number().positive(),
    dps: z.number().optional(),
  }),
  z.object({
    type: z.literal('explode'),
    radius: z.number().positive(),
    damage: z.number().positive(),
    tags: z.array(z.string()),
  }),
  z.object({
    type: z.literal('heal'),
    amount: z.number().nonnegative(),
    maxHpBonus: z.number().optional(),
  }),
]);
export type RuneAction = z.infer<typeof RuneActionSchema>;

export const RuneSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  rarity: z.enum(['common', 'rare']),
  hooks: z
    .array(
      z.object({
        trigger: z.enum(['onSpellHit', 'onEnemyDeath', 'onWardBlock', 'onAcquire']),
        condition: z
          .object({
            spellTag: z.string().optional(),
            status: z.string().optional(),
            enemyKind: z.string().optional(),
          })
          .optional(),
        action: RuneActionSchema,
      }),
    )
    .optional(),
  /** static numeric/bool merges into world.mods */
  mods: z
    .object({
      boltPierce: z.number().optional(),
      boltSplit: z.boolean().optional(),
      arcChains: z.number().optional(),
      wardReflect: z.boolean().optional(),
      shockOnExplosion: z.boolean().optional(),
      manaMaxBonus: z.number().optional(),
      focusBonus: z.number().optional(),
      damageMult: z.number().optional(),
    })
    .optional(),
  /** grammar runes: live gesture-system tuning (§7 문법 룬) */
  gesture: z
    .object({
      stableFramesDelta: z.number().int().optional(),
      phraseGapMs: z.number().positive().optional(),
    })
    .optional(),
});
export type RuneDef = z.infer<typeof RuneSchema>;

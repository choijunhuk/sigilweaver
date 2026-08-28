import { parseData } from '../data/load';
import { EnemySchema, SpellConfigSchema, type EnemyDef, type SpellConfig } from '../data/schemas';
import rawSpells from '../../data/config/spells.json';

const enemyModules = import.meta.glob('../../data/enemies/*.json', { eager: true });

export interface CombatContent {
  spells: SpellConfig;
  enemies: Map<string, EnemyDef>;
}

export function loadContent(): CombatContent {
  const spells = parseData(SpellConfigSchema, rawSpells, 'data/config/spells.json');
  const enemies = new Map<string, EnemyDef>();
  for (const [path, mod] of Object.entries(enemyModules)) {
    const raw = (mod as { default: unknown }).default;
    const def = parseData(EnemySchema, raw, path);
    enemies.set(def.id, def);
  }
  if (enemies.size === 0) throw new Error('no enemy definitions found');
  return { spells, enemies };
}

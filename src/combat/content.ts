import { parseData } from '../data/load';
import {
  EnemySchema,
  EventListSchema,
  PhraseListSchema,
  RuneSchema,
  SpellConfigSchema,
  StageSchema,
  type EnemyDef,
  type EventDef,
  type PhraseDef,
  type RuneDef,
  type SpellConfig,
  type StageDef,
} from '../data/schemas';
import rawSpells from '../../data/config/spells.json';
import rawPhrases from '../../data/phrases.json';
import rawEvents from '../../data/events.json';
import rawChapter1 from '../../data/stages/chapter1.json';

const enemyModules = import.meta.glob('../../data/enemies/*.json', { eager: true });
const runeModules = import.meta.glob('../../data/runes/*.json', { eager: true });

export interface CombatContent {
  spells: SpellConfig;
  enemies: Map<string, EnemyDef>;
  phrases: PhraseDef[];
  runes: RuneDef[];
  events: EventDef[];
  stage: StageDef;
}

function collect<T>(modules: Record<string, unknown>, parse: (raw: unknown, path: string) => T): T[] {
  return Object.entries(modules).map(([path, mod]) =>
    parse((mod as { default: unknown }).default, path),
  );
}

export function loadContent(): CombatContent {
  const spells = parseData(SpellConfigSchema, rawSpells, 'data/config/spells.json');
  const enemies = new Map<string, EnemyDef>();
  for (const def of collect(enemyModules, (raw, p) => parseData(EnemySchema, raw, p))) {
    enemies.set(def.id, def);
  }
  const phrases = parseData(PhraseListSchema, rawPhrases, 'data/phrases.json');
  const runes = collect(runeModules, (raw, p) => parseData(RuneSchema, raw, p));
  const events = parseData(EventListSchema, rawEvents, 'data/events.json');
  const stage = parseData(StageSchema, rawChapter1, 'data/stages/chapter1.json');
  if (enemies.size === 0) throw new Error('no enemy definitions found');
  if (runes.length === 0) throw new Error('no rune definitions found');
  return { spells, enemies, phrases, runes, events, stage };
}

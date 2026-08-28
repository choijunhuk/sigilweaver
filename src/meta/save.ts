import { SaveDataSchema, type SaveData } from '../data/schemas';
import { warn } from '../core/log';

const KEY = 'sigilweaver_save';

export function defaultSave(): SaveData {
  return {
    schemaVersion: 1,
    calibrated: false,
    tutorialDone: false,
    bestKills: 0,
    bestRoom: 0,
    cleared: false,
    settings: { relaxedHands: false, haptics: true },
  };
}

// migration chain per schemaVersion (§18); v1 is current
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    let data = JSON.parse(raw) as Record<string, unknown>;
    let v = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;
    while (migrations[v]) {
      data = migrations[v](data);
      v = data.schemaVersion as number;
    }
    const parsed = SaveDataSchema.safeParse(data);
    if (!parsed.success) {
      warn('data', 'save corrupt, resetting', parsed.error.issues[0]);
      return defaultSave();
    }
    return parsed.data;
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    warn('data', 'save write failed', e);
  }
}

export function updateSave(patch: (s: SaveData) => void): SaveData {
  const s = loadSave();
  patch(s);
  writeSave(s);
  return s;
}

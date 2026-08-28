/** Category logger. Silent in release builds (§16). */
export type LogCategory = 'cv' | 'gesture' | 'combat' | 'game' | 'data';

const enabled = import.meta.env.DEV;

export function log(category: LogCategory, ...args: unknown[]): void {
  if (enabled) console.log(`[${category}]`, ...args);
}

export function warn(category: LogCategory, ...args: unknown[]): void {
  if (enabled) console.warn(`[${category}]`, ...args);
}

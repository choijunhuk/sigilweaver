import { describe, expect, it } from 'vitest';
import { GestureConfigSchema } from '../src/data/schemas';
import { parseData } from '../src/data/load';
import gestureJson from '../data/config/gesture.json';

describe('data loader', () => {
  it('accepts the shipped gesture config', () => {
    const cfg = parseData(GestureConfigSchema, gestureJson, 'gesture.json');
    expect(cfg.stableFrames).toBeGreaterThan(0);
  });

  it('rejects invalid data with a readable path', () => {
    const bad = { ...gestureJson, stableFrames: 'four' };
    expect(() => parseData(GestureConfigSchema, bad, 'gesture.json')).toThrow(/stableFrames/);
  });

  it('rejects missing fields', () => {
    expect(() => parseData(GestureConfigSchema, {}, 'gesture.json')).toThrow(/curlBent/);
  });
});

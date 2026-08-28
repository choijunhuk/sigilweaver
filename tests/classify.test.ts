import { describe, expect, it } from 'vitest';
import { classify } from '../src/gesture/classify';
import { GestureConfigSchema } from '../src/data/schemas';
import { parseData } from '../src/data/load';
import type { HandFeatures } from '../src/gesture/types';
import gestureJson from '../data/config/gesture.json';

const cfg = parseData(GestureConfigSchema, gestureJson, 'gesture.json');

function features(partial: Partial<HandFeatures>): HandFeatures {
  return { curls: [0, 0, 0, 0, 0], pinchDist: 1, vSpread: 1, ...partial };
}

describe('classify (synthetic features)', () => {
  it('recognizes WARD (fist)', () => {
    const f = features({ curls: [0.8, 0.9, 0.9, 0.9, 0.9], pinchDist: 0.6 });
    expect(classify(f, cfg).sigil).toBe('WARD');
  });

  it('recognizes PULSE (open palm)', () => {
    const f = features({ curls: [0.05, 0.05, 0.05, 0.05, 0.05] });
    expect(classify(f, cfg).sigil).toBe('PULSE');
  });

  it('recognizes BOLT (point)', () => {
    const f = features({ curls: [0.5, 0.1, 0.9, 0.9, 0.9] });
    expect(classify(f, cfg).sigil).toBe('BOLT');
  });

  it('recognizes ARC (V with spread)', () => {
    const f = features({ curls: [0.5, 0.1, 0.1, 0.9, 0.9], vSpread: 0.8 });
    expect(classify(f, cfg).sigil).toBe('ARC');
  });

  it('recognizes FOCUS (pinch)', () => {
    const f = features({ curls: [0.3, 0.4, 0.2, 0.2, 0.2], pinchDist: 0.05 });
    expect(classify(f, cfg).sigil).toBe('FOCUS');
  });

  it('returns NONE for ambiguous half-open hand', () => {
    const f = features({ curls: [0.45, 0.45, 0.45, 0.45, 0.45], pinchDist: 0.5 });
    expect(classify(f, cfg).sigil).toBe('NONE');
  });
});

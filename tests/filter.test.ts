import { describe, expect, it } from 'vitest';
import { TemporalFilter } from '../src/gesture/filter';
import { GestureConfigSchema } from '../src/data/schemas';
import { parseData } from '../src/data/load';
import gestureJson from '../data/config/gesture.json';

const cfg = parseData(GestureConfigSchema, gestureJson, 'gesture.json');
const FRAME = 1000 / 24;

describe('TemporalFilter', () => {
  it('confirms after stableFrames consecutive frames', () => {
    const f = new TemporalFilter(cfg);
    let t = 0;
    let fired = null;
    for (let i = 0; i < cfg.stableFrames; i++) {
      fired = f.update({ sigil: 'BOLT', confidence: 0.8 }, (t += FRAME));
    }
    expect(fired?.sigil).toBe('BOLT');
  });

  it('resets streak when candidate changes', () => {
    const f = new TemporalFilter(cfg);
    let t = 0;
    f.update({ sigil: 'BOLT', confidence: 0.8 }, (t += FRAME));
    f.update({ sigil: 'BOLT', confidence: 0.8 }, (t += FRAME));
    f.update({ sigil: 'WARD', confidence: 0.8 }, (t += FRAME));
    const ev = f.update({ sigil: 'BOLT', confidence: 0.8 }, (t += FRAME));
    expect(ev).toBeNull(); // BOLT streak restarted at 1
  });

  it('debounces same-sigil re-fire and holds while pose is kept', () => {
    const f = new TemporalFilter(cfg);
    let t = 0;
    let fires = 0;
    // hold the pose for ~2s straight — must fire exactly once (hysteresis hold)
    for (let i = 0; i < 48; i++) {
      if (f.update({ sigil: 'PULSE', confidence: 0.8 }, (t += FRAME))) fires++;
    }
    expect(fires).toBe(1);
  });

  it('re-fires after release and debounce window', () => {
    const f = new TemporalFilter(cfg);
    let t = 0;
    let fires = 0;
    for (let i = 0; i < cfg.stableFrames; i++) {
      if (f.update({ sigil: 'PULSE', confidence: 0.8 }, (t += FRAME))) fires++;
    }
    // release the hand
    for (let i = 0; i < 3; i++) f.update({ sigil: 'NONE', confidence: 0 }, (t += FRAME));
    t += cfg.debounceMs; // wait out debounce
    for (let i = 0; i < cfg.stableFrames; i++) {
      if (f.update({ sigil: 'PULSE', confidence: 0.8 }, (t += FRAME))) fires++;
    }
    expect(fires).toBe(2);
  });

  it('ignores low-confidence frames', () => {
    const f = new TemporalFilter(cfg);
    let t = 0;
    let fired = null;
    for (let i = 0; i < 10; i++) {
      fired = f.update({ sigil: 'ARC', confidence: cfg.minConfidence - 0.01 }, (t += FRAME));
    }
    expect(fired).toBeNull();
  });
});

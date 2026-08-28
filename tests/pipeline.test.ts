import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ReplayGestureSource } from '../src/gesture/replaySource';
import { RecordingSchema, type Recording } from '../src/gesture/recording';
import { GestureConfigSchema } from '../src/data/schemas';
import { parseData } from '../src/data/load';
import { makeRecording, POSES } from './helpers/synthHand';
import type { Sigil } from '../src/gesture/types';
import gestureJson from '../data/config/gesture.json';

const cfg = parseData(GestureConfigSchema, gestureJson, 'gesture.json');
const SIGILS = Object.keys(POSES) as Exclude<Sigil, 'NONE'>[];

describe('full pipeline on synthetic hands (landmarks -> features -> classify -> FSM)', () => {
  it.each(SIGILS)('%s: clean pose confirms exactly once while held', (sigil) => {
    const rec = makeRecording(sigil, 24); // 1s hold
    const events = new ReplayGestureSource(rec, cfg).runSync();
    expect(events).toHaveLength(1);
    expect(events[0].sigil).toBe(sigil);
  });

  it.each(SIGILS)('%s: survives landmark jitter without misfire', (sigil) => {
    for (let seed = 1; seed <= 5; seed++) {
      const rec = makeRecording(sigil, 24, { jitter: 0.08, seed });
      const events = new ReplayGestureSource(rec, cfg).runSync();
      const wrong = events.filter((e) => e.sigil !== sigil);
      expect(wrong, `seed ${seed} misfired ${wrong.map((e) => e.sigil)}`).toHaveLength(0);
      expect(events.length, `seed ${seed} did not confirm`).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(SIGILS)('%s: left hand mirrors to same result', (sigil) => {
    const rec = makeRecording(sigil, 24, { handedness: 'Left' });
    // mirror x like a real left hand seen by the camera
    for (const f of rec.frames) {
      for (let i = 0; i < 21; i++) f.lm[i * 3] = 1 - f.lm[i * 3];
    }
    const events = new ReplayGestureSource(rec, cfg).runSync();
    expect(events).toHaveLength(1);
    expect(events[0].sigil).toBe(sigil);
  });
});

// Real recorded fixtures (fixtures/*.json, filename label inside). Recorded via
// spike page recorder; skipped until they exist. Exit criteria §20 Phase 2:
// per-sigil correct >= 90%, misfire <= 5%.
const FIXTURES_DIR = join(process.cwd(), 'fixtures');
const fixtureFiles: string[] = existsSync(FIXTURES_DIR)
  ? readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'))
  : [];

describe.skipIf(fixtureFiles.length === 0)('recorded fixtures', () => {
  it.each(fixtureFiles)('%s: dominant confirmed sigil matches label', (file: string) => {
    const raw: unknown = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'));
    const rec: Recording = parseData(RecordingSchema, raw, file);
    const events = new ReplayGestureSource(rec, cfg).runSync();
    if (rec.label === 'MIXED') return; // free-form sessions: just must not crash
    expect(events.length).toBeGreaterThanOrEqual(1);
    const correct = events.filter((e) => e.sigil === rec.label).length;
    expect(correct / events.length).toBeGreaterThanOrEqual(0.9);
  });
});

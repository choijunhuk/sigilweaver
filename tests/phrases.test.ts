import { describe, expect, it } from 'vitest';
import { PhraseMatcher } from '../src/gesture/phrases';
import { loadContent } from '../src/combat/content';

const { phrases } = loadContent();

describe('PhraseMatcher', () => {
  it('matches WARD-ARC-PULSE as thunderstorm', () => {
    const m = new PhraseMatcher(phrases);
    expect(m.push('WARD', 0)).toBeNull();
    expect(m.push('ARC', 500)).toBeNull();
    expect(m.push('PULSE', 1000)?.id).toBe('thunderstorm');
    expect(m.tokens).toHaveLength(0); // buffer cleared
  });

  it('matches double ARC as chain_surge', () => {
    const m = new PhraseMatcher(phrases);
    m.push('ARC', 0);
    expect(m.push('ARC', 800)?.id).toBe('chain_surge');
  });

  it('resets on token gap over maxGapMs', () => {
    const m = new PhraseMatcher(phrases);
    m.push('WARD', 0);
    m.push('ARC', 500);
    expect(m.push('PULSE', 500 + 2501)).toBeNull(); // gap too long — buffer reset
  });

  it('grammar rune can extend the gap live', () => {
    const m = new PhraseMatcher(phrases);
    m.maxGapMs = 4000; // 연장된 문장
    m.push('WARD', 0);
    m.push('ARC', 3000);
    expect(m.push('PULSE', 6500)?.id).toBe('thunderstorm');
  });

  it('partial buffer produces hints', () => {
    const m = new PhraseMatcher(phrases);
    m.push('WARD', 0);
    const hints = m.hints(100).map((p) => p.id);
    expect(hints).toContain('thunderstorm');
    expect(hints).not.toContain('chain_surge');
  });

  it('mismatched token still counts as new sequence start', () => {
    const m = new PhraseMatcher(phrases);
    m.push('WARD', 0);
    m.push('BOLT', 400); // breaks thunderstorm
    m.push('WARD', 800);
    m.push('ARC', 1200);
    expect(m.push('PULSE', 1600)?.id).toBe('thunderstorm');
  });
});

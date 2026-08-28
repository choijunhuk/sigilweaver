import type { PhraseDef } from '../data/schemas';
import type { Sigil } from './types';

/**
 * Token-buffer phrase matcher (§6): every confirmed sigil is pushed; when the
 * buffer's tail matches a registered phrase the phrase fires as a BONUS on top
 * of the single-sigil cast, and the buffer clears. Gap over maxGapMs resets.
 */
export class PhraseMatcher {
  private buffer: { sigil: Sigil; at: number }[] = [];
  /** mutable so grammar runes can extend it live (연장된 문장) */
  maxGapMs: number;

  constructor(
    private phrases: PhraseDef[],
    maxGapMs = 2500,
  ) {
    this.maxGapMs = maxGapMs;
  }

  get tokens(): Sigil[] {
    return this.buffer.map((b) => b.sigil);
  }

  push(sigil: Sigil, at: number): PhraseDef | null {
    if (sigil === 'NONE') return null;
    const last = this.buffer[this.buffer.length - 1];
    if (last && at - last.at > this.maxGapMs) this.buffer.length = 0;
    this.buffer.push({ sigil, at });
    if (this.buffer.length > 3) this.buffer.shift();

    for (const phrase of this.phrases) {
      const n = phrase.tokens.length;
      if (this.buffer.length < n) continue;
      const tail = this.buffer.slice(-n);
      if (phrase.tokens.every((t, i) => tail[i].sigil === t)) {
        this.buffer.length = 0;
        return phrase;
      }
    }
    return null;
  }

  /** phrases whose token list starts with the current buffer tail (UI hint §12) */
  hints(at: number): PhraseDef[] {
    const last = this.buffer[this.buffer.length - 1];
    if (!last || at - last.at > this.maxGapMs) return [];
    const toks = this.tokens;
    return this.phrases.filter(
      (p) =>
        p.tokens.length > toks.length &&
        toks.every((t, i) => p.tokens[i] === t),
    );
  }

  reset(): void {
    this.buffer.length = 0;
  }
}

import { describe, expect, it } from 'vitest';
import { RETRY_PHRASE_COUNT, nextRetryPhrase } from './retry-phrases';

describe('nextRetryPhrase', () => {
  it('ne rend jamais la phrase précédente, quel que soit le tirage', () => {
    for (let previous = 1; previous <= RETRY_PHRASE_COUNT; previous++) {
      for (const random of [0, 0.25, 0.5, 0.99999]) expect(nextRetryPhrase(previous, () => random)).not.toBe(previous);
    }
  });

  it('reste entre 1 et le nombre de phrases, sans précédente comme avec', () => {
    for (const random of [0, 0.5, 0.99999]) {
      for (const previous of [null, 3]) {
        const phrase = nextRetryPhrase(previous, () => random);
        expect(phrase).toBeGreaterThanOrEqual(1);
        expect(phrase).toBeLessThanOrEqual(RETRY_PHRASE_COUNT);
      }
    }
  });

  it('couvre toutes les phrases quand le tirage varie', () => {
    const seen = new Set(Array.from({ length: 100 }, (_, i) => nextRetryPhrase(null, () => i / 100)));
    expect(seen.size).toBe(RETRY_PHRASE_COUNT);
  });
});

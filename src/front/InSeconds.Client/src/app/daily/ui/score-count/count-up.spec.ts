import { countUp } from './count-up';

describe('countUp', () => {
  afterEach(() => {
    delete (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations;
  });

  it('pose 0 tout de suite pour une cible à 0', () => {
    const values: number[] = [];
    countUp(0, v => values.push(v));
    expect(values).toEqual([0]);
  });

  it('pose la valeur finale sans animer quand les animations sont coupées (E2E)', () => {
    (globalThis.window as { __disableAnimations?: boolean }).__disableAnimations = true;
    const values: number[] = [];
    countUp(850, v => values.push(v));
    expect(values).toEqual([850]);
  });

  it('arrive à la cible en montant', async () => {
    const values: number[] = [];
    countUp(100, v => values.push(v), 30);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(values.at(-1)).toBe(100);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('peut partir d\'une autre valeur que 0 (le total de la partie)', async () => {
    const values: number[] = [];
    countUp(2100, v => values.push(v), 30, 1250);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(values[0]).toBeGreaterThanOrEqual(1250);
    expect(values.at(-1)).toBe(2100);
  });
});

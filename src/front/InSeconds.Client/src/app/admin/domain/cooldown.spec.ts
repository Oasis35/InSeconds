import { cooldownTone, isValidCooldownPercent } from './cooldown';

describe('cooldown (domaine)', () => {
  it('valide la part du pool en cooldown : entier de 10 à 90', () => {
    expect([10, 75, 90].every(isValidCooldownPercent)).toBe(true);
    expect([9, 91, 0, 50.5, null, undefined, NaN].some(isValidCooldownPercent)).toBe(false);
  });

  it('colore le cooldown : rouge sous 7 jours, orange sous le seuil de 14, vert au-delà', () => {
    expect([0, 6].map(cooldownTone)).toEqual(['low', 'low']);
    expect([7, 13].map(cooldownTone)).toEqual(['medium', 'medium']);
    expect([14, 120].map(cooldownTone)).toEqual(['high', 'high']);
  });
});

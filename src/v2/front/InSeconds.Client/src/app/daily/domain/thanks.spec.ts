import { roundedGamesPlayed } from './thanks';

describe('roundedGamesPlayed', () => {
  it('arrondit à la dizaine inférieure', () => {
    expect(roundedGamesPlayed(2559)).toBe(2550);
    expect(roundedGamesPlayed(2550)).toBe(2550);
    expect(roundedGamesPlayed(10)).toBe(10);
  });

  it('rend `null` sous dix parties : le message se dit sans chiffre', () => {
    expect(roundedGamesPlayed(9)).toBeNull();
    expect(roundedGamesPlayed(0)).toBeNull();
    expect(roundedGamesPlayed(Number.NaN)).toBeNull();
  });
});

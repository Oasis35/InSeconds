import { formatSeconds } from './format-seconds';

describe('formatSeconds', () => {
  it('virgule et espace insécable en français', () => {
    expect(formatSeconds(0.5, 'fr')).toBe('0,5 s');
    expect(formatSeconds(10, 'fr')).toBe('10 s');
    expect(formatSeconds(4.14, 'fr')).toBe('4,1 s');
  });

  it('point en anglais', () => {
    expect(formatSeconds(0.5, 'en')).toBe('0.5 s');
    expect(formatSeconds(1.5, 'en')).toBe('1.5 s');
  });

  it('décimales fixes pour le chrono', () => {
    expect(formatSeconds(6, 'fr', 1)).toBe('6,0 s');
    expect(formatSeconds(6.25, 'fr', 1)).toBe('6,3 s');
  });
});

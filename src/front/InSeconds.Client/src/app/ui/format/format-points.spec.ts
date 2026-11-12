import { formatPoints } from './format-points';

describe('formatPoints', () => {
  it('groupe les milliers selon la langue', () => {
    expect(formatPoints(1840, 'fr').replace(/\s/g, ' ')).toBe('1 840');
    expect(formatPoints(1840, 'en')).toBe('1,840');
    expect(formatPoints(980, 'fr')).toBe('980');
  });
});

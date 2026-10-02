import { formatPercent, formatPeriod, sizeClass, storyFileName } from './weekly-story.format';

describe('weekly-story.format', () => {
  it('formatPeriod : même mois', () => {
    expect(formatPeriod('2026-09-21', '2026-09-27')).toBe('21 → 27 sept.');
  });

  it('formatPeriod : à cheval sur deux mois', () => {
    expect(formatPeriod('2026-09-29', '2026-10-05')).toBe('29 sept. → 5 oct.');
  });

  it('formatPercent arrondit à l\'entier avec espace insécable', () => {
    expect(formatPercent(8.3)).toBe('8 %');
    expect(formatPercent(87.5)).toBe('88 %');
  });

  it('sizeClass réduit la police des textes longs', () => {
    expect(sizeClass('Daft Punk')).toBe('');
    expect(sizeClass('x'.repeat(23))).toBe('len-m');
    expect(sizeClass('x'.repeat(33))).toBe('len-l');
  });

  it('storyFileName', () => {
    expect(storyFileName('found', '2026-09-27')).toBe('instagram-trouve-2026-09-27.png');
    expect(storyFileName('missed', '2026-09-27')).toBe('instagram-rate-2026-09-27.png');
  });
});

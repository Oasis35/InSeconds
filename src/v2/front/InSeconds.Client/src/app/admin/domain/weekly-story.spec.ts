import {
  CUSTOM_TITLE_MAX_LENGTH, clampCustomTitle, defaultPeriod, formatPercent, formatPeriod, isPeriodValid, sizeClass,
  storyFileName, storyTitle, utcDay,
} from './weekly-story';

describe('weekly-story (domaine)', () => {
  it('formatPeriod : un seul mois, ou deux', () => {
    expect(formatPeriod('2026-09-21', '2026-09-27')).toBe('21 → 27 sept.');
    expect(formatPeriod('2026-09-29', '2026-10-05')).toBe('29 sept. → 5 oct.');
  });

  it('formatPercent arrondit à l\'entier', () => {
    expect(formatPercent(87.4)).toBe('87 %');
    expect(formatPercent(7.5)).toBe('8 %');
  });

  it('sizeClass réduit la police selon la longueur', () => {
    expect(sizeClass('Daft Punk')).toBe('');
    expect(sizeClass('a'.repeat(23))).toBe('len-m');
    expect(sizeClass('a'.repeat(33))).toBe('len-l');
  });

  it('storyFileName porte le genre et le dernier jour', () => {
    expect(storyFileName('found', '2026-09-27')).toBe('instagram-trouve-2026-09-27.png');
    expect(storyFileName('missed', '2026-09-27')).toBe('instagram-rate-2026-09-27.png');
  });

  it('storyTitle : textes prédéfinis, texte libre rogné', () => {
    expect(storyTitle('thisWeek', 'ignoré')).toBe('Cette semaine dans InSeconds 🎧');
    expect(storyTitle('lastWeek', '')).toBe('La semaine dernière dans InSeconds 🎧');
    expect(storyTitle('custom', '  Best of  ')).toBe('Best of');
    expect(storyTitle('custom', '   ')).toBe('');
  });

  it('clampCustomTitle coupe à la longueur maximale', () => {
    expect(clampCustomTitle('x'.repeat(80))).toHaveLength(CUSTOM_TITLE_MAX_LENGTH);
  });

  it('defaultPeriod : les 7 derniers jours en UTC, même à cheval sur un mois', () => {
    const now = new Date('2026-10-03T23:30:00Z');
    expect(utcDay(now, 1)).toBe('2026-10-02');
    expect(defaultPeriod(now)).toEqual({ from: '2026-09-27', to: '2026-10-03' });
  });

  it('isPeriodValid : début ≤ fin, jours remplis', () => {
    expect(isPeriodValid('2026-09-01', '2026-09-10')).toBe(true);
    expect(isPeriodValid('2026-09-10', '2026-09-10')).toBe(true);
    expect(isPeriodValid('2026-09-10', '2026-09-01')).toBe(false);
    expect(isPeriodValid('', '2026-09-01')).toBe(false);
    expect(isPeriodValid('2026-09-01', '')).toBe(false);
  });
});

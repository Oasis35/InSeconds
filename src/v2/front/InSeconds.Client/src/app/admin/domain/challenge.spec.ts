import {
  ChallengePlayer, ChallengeStats, availableMonths, chipColors, formatMonth, inMonth, monthOf, playerLabel,
  rateColor, resolveMonth, shiftMonth, shortId, statusDotColor, statusLabelKey, unfinishedCount,
} from './challenge';

const player = (overrides: Partial<ChallengePlayer> = {}): ChallengePlayer =>
  ({ playerId: '0123456789abcdef-0000', status: 'Completed', score: 100, pseudo: null, ...overrides });

describe('challenge (domaine)', () => {
  it('lit le mois d\'un jour et le met en forme', () => {
    expect(monthOf('2026-10-05')).toBe('2026-10');
    expect(formatMonth('2026-10', 'fr')).toBe('Octobre 2026');
    expect(formatMonth('2026-01', 'fr')).toBe('Janvier 2026');
    expect(formatMonth('2026-10', 'en')).toBe('October 2026');
  });

  it('liste les mois des défis, du plus récent au plus ancien, sans doublon', () => {
    const months = availableMonths(
      [{ date: '2026-09-30' }, { date: '2026-10-01' }],
      [{ date: '2026-10-05' }, { date: '2026-08-12' }],
    );

    expect(months).toEqual(['2026-10', '2026-09', '2026-08']);
  });

  describe('resolveMonth', () => {
    const months = ['2026-09', '2026-08'];

    it('garde le mois demandé s\'il a des défis', () => {
      expect(resolveMonth('2026-08', months, '2026-10')).toBe('2026-08');
    });

    it('prend le mois courant à défaut de demande', () => {
      expect(resolveMonth(null, ['2026-10', '2026-09'], '2026-10')).toBe('2026-10');
    });

    it('prend le plus récent quand ni le demandé ni le courant n\'ont de défi', () => {
      expect(resolveMonth('2026-07', months, '2026-10')).toBe('2026-09');
    });

    it('rend le mois courant sans aucun défi', () => {
      expect(resolveMonth(null, [], '2026-10')).toBe('2026-10');
    });
  });

  describe('shiftMonth', () => {
    const months = ['2026-10', '2026-09', '2026-08'];

    it('+1 va vers le plus récent, -1 vers le plus ancien', () => {
      expect(shiftMonth(months, '2026-09', 1)).toBe('2026-10');
      expect(shiftMonth(months, '2026-09', -1)).toBe('2026-08');
    });

    it('reste sur place aux extrémités et pour un mois inconnu', () => {
      expect(shiftMonth(months, '2026-10', 1)).toBe('2026-10');
      expect(shiftMonth(months, '2026-08', -1)).toBe('2026-08');
      expect(shiftMonth(months, '2025-01', 1)).toBe('2025-01');
    });
  });

  it('filtre les éléments d\'un mois', () => {
    const items = [{ date: '2026-10-02' }, { date: '2026-09-30' }];

    expect(inMonth(items, '2026-10')).toEqual([{ date: '2026-10-02' }]);
  });

  it('abrège un identifiant à 8 caractères et préfère le pseudo', () => {
    expect(shortId('0123456789abcdef-0000')).toBe('01234567');
    expect(playerLabel(player())).toBe('01234567');
    expect(playerLabel(player({ pseudo: 'Alice' }))).toBe('Alice');
  });

  it('additionne abandons et parties inachevées', () => {
    const challenge = { abandonedCount: 2, expiredCount: 3 } as ChallengeStats;

    expect(unfinishedCount(challenge)).toBe(5);
  });

  it('traduit les statuts connus seulement', () => {
    expect(statusLabelKey('Expired')).toBe('admin.players.status.Expired');
    expect(statusLabelKey('Inconnu')).toBeNull();
    expect(statusDotColor('Abandoned')).toBe('var(--bg-warn)');
    expect(statusDotColor('Pending')).toBe('var(--text-faint)');
    expect(statusDotColor('Expired')).toBe('var(--text-muted)');
  });

  it('donne la même couleur au même joueur et des couleurs de la DA aux taux', () => {
    expect(chipColors('abc')).toEqual(chipColors('abc'));
    expect(chipColors('abc').bg).toMatch(/^hsl\(/);
    expect(rateColor(80)).toBe('var(--color-success)');
    expect(rateColor(40)).toBe('var(--color-warn)');
    expect(rateColor(10)).toBe('var(--color-fail)');
  });
});

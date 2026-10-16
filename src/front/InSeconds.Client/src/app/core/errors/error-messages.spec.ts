import { UNKNOWN_ERROR_MESSAGE_KEY, errorMessageKey } from './error-messages';

describe('errorMessageKey', () => {
  it('traduit un code connu en sa clé i18n', () => {
    expect(errorMessageKey('common.too_many_requests')).toBe('errors.common.too_many_requests');
  });

  it("traduit les codes de l'admin renvoyés par le back (jour pas fini, date ou période invalide, pool insuffisant)", () => {
    for (const code of ['admin.day_not_over', 'admin.invalid_date', 'admin.invalid_period', 'admin.pool_insufficient']) {
      expect(errorMessageKey(code)).toBe(`errors.${code}`);
    }
  });

  it('tombe sur le message générique pour un code inconnu ou absent', () => {
    expect(errorMessageKey('daily.not_yet_known')).toBe(UNKNOWN_ERROR_MESSAGE_KEY);
    expect(errorMessageKey(null)).toBe(UNKNOWN_ERROR_MESSAGE_KEY);
    expect(errorMessageKey('')).toBe(UNKNOWN_ERROR_MESSAGE_KEY);
  });

  it('ne se laisse pas tromper par une propriété héritée d\'Object', () => {
    expect(errorMessageKey('toString')).toBe(UNKNOWN_ERROR_MESSAGE_KEY);
  });
});

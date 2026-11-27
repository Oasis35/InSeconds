import { ERROR_MESSAGE_KEYS, UNKNOWN_ERROR_MESSAGE_KEY, errorMessageKey } from './error-messages';
import publishedErrorCodes from './published-error-codes.json';

/**
 * Les codes publiés par le back (`published-error-codes.json`, tenu à jour par `PublishedErrorCodesTests` côté back) qui n'ont
 * volontairement pas de message dans `ERROR_MESSAGE_KEYS`, avec la raison. Tout autre code publié doit y être traduit.
 */
const CODES_SANS_MESSAGE: Readonly<Record<string, string>> = {
  'daily.archive_not_available': "le front lit ce 404 comme « jour non publié » (daily.api.ts) et affiche la page introuvable, jamais un message d'erreur",
  'admin.close_day_failed': "code d'échec de la tâche daily-close-day : l'admin n'en lit que l'état de la tâche, pas un message",
  'players.purge_failed': "code d'échec de la tâche players-purge-expired-tokens : l'admin n'en lit que l'état de la tâche, pas un message",
};

/** Les codes que le front produit lui-même, sans réponse de l'API. */
const CODES_DU_FRONT: readonly string[] = ['common.network'];

describe('errorMessageKey', () => {
  it('traduit un code connu en sa clé i18n', () => {
    expect(errorMessageKey('common.too_many_requests')).toBe('errors.common.too_many_requests');
  });

  it("traduit les codes de l'admin renvoyés par le back (jour pas fini, date invalide, pool insuffisant)", () => {
    for (const code of ['admin.day_not_over', 'admin.invalid_date', 'admin.invalid_month', 'admin.pool_insufficient']) {
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

  describe('contrat avec les codes publiés par le back', () => {
    it('chaque code publié a un message, ou une raison écrite de ne pas en avoir', () => {
      const manquants = publishedErrorCodes.filter((code) => !(code in ERROR_MESSAGE_KEYS) && !(code in CODES_SANS_MESSAGE));

      expect(manquants).toEqual([]);
    });

    it('une exclusion devenue inutile est retirée (le code a un message, ou n\'est plus publié)', () => {
      const inutiles = Object.keys(CODES_SANS_MESSAGE).filter((code) => code in ERROR_MESSAGE_KEYS || !publishedErrorCodes.includes(code));

      expect(inutiles).toEqual([]);
    });

    it('chaque entrée de la table correspond à un code publié ou produit par le front', () => {
      const orphelins = Object.keys(ERROR_MESSAGE_KEYS).filter((code) => !publishedErrorCodes.includes(code) && !CODES_DU_FRONT.includes(code));

      expect(orphelins).toEqual([]);
    });
  });
});

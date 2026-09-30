/**
 * La table unique qui traduit un code d'erreur de l'API en clé i18n (§ 6.6 du plan v2). Un code
 * absent de la table tombe sur le message générique, accompagné du `traceId`. Chaque module y
 * ajoute ses codes quand il les crée côté back (`daily.already_played` →
 * `errors.daily.already_played`) ; un test vérifie que chaque clé existe en FR et en EN.
 */
export const ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  'common.bad_request': 'errors.common.bad_request',
  'common.conflict': 'errors.common.conflict',
  'common.forbidden': 'errors.common.forbidden',
  'common.network': 'errors.common.network',
  'common.new_version': 'errors.common.new_version',
  'common.not_found': 'errors.common.not_found',
  'common.too_many_requests': 'errors.common.too_many_requests',
  'common.unauthorized': 'errors.common.unauthorized',
  'common.unexpected': 'errors.common.unexpected',
};

/** Message affiché pour un code inconnu, toujours avec le `traceId` quand il existe. */
export const UNKNOWN_ERROR_MESSAGE_KEY = 'errors.common.unknown';

export function errorMessageKey(code: string | null | undefined): string {
  return code && Object.hasOwn(ERROR_MESSAGE_KEYS, code) ? ERROR_MESSAGE_KEYS[code] : UNKNOWN_ERROR_MESSAGE_KEY;
}

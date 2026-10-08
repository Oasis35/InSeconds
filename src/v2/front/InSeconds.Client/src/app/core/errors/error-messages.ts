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

  // Catalogue
  'catalogue.deezer_unavailable': 'errors.catalogue.deezer_unavailable',
  'catalogue.duplicate_deezer_id': 'errors.catalogue.duplicate_deezer_id',
  'catalogue.not_found_on_deezer': 'errors.catalogue.not_found_on_deezer',
  'catalogue.track_in_today_challenge': 'errors.catalogue.track_in_today_challenge',
  'catalogue.track_in_use': 'errors.catalogue.track_in_use',

  // Daily
  'daily.abandoned': 'errors.daily.abandoned',
  'daily.already_answered': 'errors.daily.already_answered',
  'daily.already_played': 'errors.daily.already_played',
  'daily.hint_locked': 'errors.daily.hint_locked',
  'daily.listened_duration_below_verified_minimum': 'errors.daily.listened_duration_below_verified_minimum',
  'daily.no_challenge': 'errors.daily.no_challenge',
  'daily.session_not_found': 'errors.daily.session_not_found',
  'daily.track_lock_not_released': 'errors.daily.track_lock_not_released',
  'daily.track_not_found': 'errors.daily.track_not_found',

  // Players
  'players.email_taken': 'errors.players.email_taken',
  'players.guest_forbidden': 'errors.players.guest_forbidden',
  'players.invalid_or_expired_token': 'errors.players.invalid_or_expired_token',
  'players.pseudo_taken': 'errors.players.pseudo_taken',
  'players.same_email': 'errors.players.same_email',
};

/** Message affiché pour un code inconnu, toujours avec le `traceId` quand il existe. */
export const UNKNOWN_ERROR_MESSAGE_KEY = 'errors.common.unknown';

export function errorMessageKey(code: string | null | undefined): string {
  return code && Object.hasOwn(ERROR_MESSAGE_KEYS, code) ? ERROR_MESSAGE_KEYS[code] : UNKNOWN_ERROR_MESSAGE_KEY;
}

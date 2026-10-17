/**
 * Délai avant de pouvoir renvoyer le lien de connexion : celui du back (un lien par minute et par
 * adresse, `SendMagicLinkEmailHandler.Throttle`). Plus tôt, l'API répondrait 204 sans rien envoyer.
 */
export const RESEND_DELAY_MS = 60_000;

/**
 * Secondes restantes avant de pouvoir renvoyer le lien, arrondies au-dessus (0 : c'est possible).
 * Jamais plus que le délai : l'horloge de l'écran peut être un peu en retard sur l'heure de l'envoi.
 */
export function resendSecondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  const seconds = Math.ceil((sentAt + RESEND_DELAY_MS - now) / 1000);
  return Math.min(RESEND_DELAY_MS / 1000, Math.max(0, seconds));
}

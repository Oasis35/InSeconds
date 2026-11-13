/** Secondes jusqu'au prochain défi : minuit UTC. */
export function secondsUntilMidnightUtc(now: Date): number {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.floor((midnight - now.getTime()) / 1000));
}

/** Le jour de jeu d'aujourd'hui (`aaaa-mm-jj`) : le jour de jeu change à minuit UTC. */
export function todayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}

/** Le jour de jeu d'hier (`aaaa-mm-jj`) : le jour de jeu change à minuit UTC. */
export function yesterdayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
}

/** `hh:mm:ss`. */
export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
}

/** Le temps qu'il reste, arrondi pour une phrase : en heures entières, en minutes sous une heure (une au moins). */
export interface TimeLeft {
  readonly unit: 'hours' | 'minutes';
  readonly value: number;
}

export function timeLeft(totalSeconds: number): TimeLeft {
  const hours = Math.floor(totalSeconds / 3600);
  if (hours >= 1) return { unit: 'hours', value: hours };
  return { unit: 'minutes', value: Math.max(1, Math.ceil(totalSeconds / 60)) };
}

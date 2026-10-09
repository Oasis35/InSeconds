/** Combien de joueurs ont trouvé le morceau en écoutant ce palier. */
export interface GuessTimeBucket {
  readonly seconds: number;
  readonly count: number;
}

/** Les chiffres d'un morceau d'un défi : taux de réussite, prolongation, écoute moyenne, répartition des temps. */
export interface ChallengeTrackStats {
  readonly position: number;
  readonly artist: string;
  readonly title: string;
  readonly totalAnswers: number;
  readonly artistCorrectRate: number;
  readonly titleCorrectRate: number;
  readonly extendedRate: number;
  readonly avgListenedSeconds: number | null;
  readonly guessTimeDistribution: readonly GuessTimeBucket[];
  readonly notFoundCount: number;
}

/** Un joueur d'un défi : l'état de sa partie et son score. `pseudo` n'existe que pour un compte (jamais un invité). */
export interface ChallengePlayer {
  readonly playerId: string;
  readonly status: string;
  readonly score: number;
  readonly pseudo: string | null;
}

/** Les stats d'un défi. Les jours sont en texte `aaaa-mm-jj`. */
export interface ChallengeStats {
  readonly id: number;
  readonly date: string;
  readonly playerCount: number;
  readonly pendingCount: number;
  readonly abandonedCount: number;
  readonly expiredCount: number;
  readonly scoreMin: number | null;
  readonly scoreMax: number | null;
  readonly scoreAvg: number | null;
  readonly scoreMedian: number | null;
  readonly tracks: readonly ChallengeTrackStats[];
  readonly players: readonly ChallengePlayer[];
  /** Instant où la photo des chiffres a été figée ; `null` si les chiffres sont calculés en direct. */
  readonly computedAt: string | null;
  readonly canRecompute: boolean;
}

export interface ChallengeHistoryTrack {
  readonly position: number;
  readonly artist: string;
  readonly title: string;
  readonly deezerTrackId: number;
}

/** Un défi de l'historique : sa date et ses morceaux. */
export interface ChallengeHistoryEntry {
  readonly id: number;
  readonly date: string;
  readonly tracks: readonly ChallengeHistoryTrack[];
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const SHORT_ID_LENGTH = 8;
const KNOWN_STATUSES: ReadonlySet<string> = new Set(['Completed', 'Pending', 'Abandoned', 'Expired']);

/** Le mois (`aaaa-mm`) d'un jour `aaaa-mm-jj`. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** `2026-10` → `Octobre 2026`. */
export function formatMonth(month: string): string {
  const [year, number] = month.split('-');
  return `${MONTH_NAMES[Number(number) - 1] ?? number} ${year}`;
}

/** Les mois qui ont au moins un défi, du plus récent au plus ancien, sans doublon. */
export function availableMonths(...lists: readonly (readonly { readonly date: string }[])[]): string[] {
  const months = new Set(lists.flatMap(list => list.map(item => monthOf(item.date))));
  return [...months].sort((a, b) => b.localeCompare(a));
}

/**
 * Le mois à afficher : celui demandé s'il a des défis, sinon le mois courant s'il en a, sinon le plus
 * récent (la liste est triée du plus récent au plus ancien) ; à défaut de tout défi, le mois courant.
 */
export function resolveMonth(requested: string | null, months: readonly string[], current: string): string {
  if (requested !== null && months.includes(requested)) return requested;
  if (months.includes(current)) return current;
  return months[0] ?? current;
}

/** Le mois voisin dans la liste (`delta` +1 : plus récent, -1 : plus ancien) ; le même s'il n'y en a pas. */
export function shiftMonth(months: readonly string[], month: string, delta: 1 | -1): string {
  const index = months.indexOf(month);
  if (index === -1) return month;
  return months[index - delta] ?? month;
}

export function inMonth<T extends { readonly date: string }>(items: readonly T[], month: string): T[] {
  return items.filter(item => monthOf(item.date) === month);
}

/** Les 8 premiers caractères d'un identifiant de joueur : ce qu'on affiche à la place d'un pseudo. */
export function shortId(playerId: string): string {
  return playerId.slice(0, SHORT_ID_LENGTH);
}

/** Le pseudo d'un compte, sinon l'identifiant court (un invité n'a pas de pseudo). */
export function playerLabel(player: ChallengePlayer): string {
  return player.pseudo ?? shortId(player.playerId);
}

/** Les parties qui n'ont pas abouti : abandons explicites et parties inachevées. */
export function unfinishedCount(challenge: ChallengeStats): number {
  return challenge.abandonedCount + challenge.expiredCount;
}

export function statusLabelKey(status: string): string | null {
  return KNOWN_STATUSES.has(status) ? `admin.players.status.${status}` : null;
}

/** Couleur du point de statut devant un chip dont la partie n'est pas terminée. */
export function statusDotColor(status: string): string {
  if (status === 'Abandoned') return 'var(--bg-warn)';
  if (status === 'Pending') return 'var(--text-faint)';
  return 'var(--text-muted)';
}

export interface ChipColors {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
}

function hueOf(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) hash = (hash * 31 + (playerId.codePointAt(i) ?? 0)) >>> 0;
  return hash % 360;
}

/** Teinte déterministe tirée de l'identifiant : un même joueur garde sa couleur d'un défi à l'autre. */
export function chipColors(playerId: string): ChipColors {
  const hue = hueOf(playerId);
  return {
    bg: `hsl(${hue} 70% 55% / 0.18)`,
    border: `hsl(${hue} 65% 62% / 0.42)`,
    text: `hsl(${hue} 85% 82%)`,
  };
}

/** Couleur d'un taux de réussite (pas de la prolongation, dont un taux haut n'est ni bon ni mauvais). */
export function rateColor(rate: number): string {
  if (rate >= 60) return 'var(--color-success)';
  if (rate >= 30) return 'var(--color-warn)';
  return 'var(--color-fail)';
}

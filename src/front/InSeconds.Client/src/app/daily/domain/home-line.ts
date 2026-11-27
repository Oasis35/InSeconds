import { Streak, streakMilestoneState } from './streak';

/** Ce que le serveur dit d'un habitué (compte avec assez de parties) : son hier, sa moyenne et sa semaine, en chiffres bruts. */
export interface ReturnRecap {
  /** Son score d'hier (partie terminée) ; `null` s'il n'a pas joué hier. */
  readonly yesterdayScore: number | null;
  readonly averageScore: number | null;
  /** Ses parties terminées sur les sept jours jusqu'à hier. */
  readonly weekGames: number;
  /** Ses morceaux trouvés (artiste et titre) au premier palier sur ces sept jours. */
  readonly weekFirstStepFound: number;
}

/** Les situations de l'accueil d'un habitué, de la plus forte à la plus discrète. */
export type HomeLineKind = 'eve' | 'record' | 'above' | 'below' | 'week';

/**
 * La phrase de l'accueil d'un habitué et le libellé du bouton qui lui répond. `phraseKey` et `buttonKey` sont des clés i18n ; `value` est le chiffre
 * mis en avant dans la phrase (des points, des jours de série ou un nombre de morceaux), `null` pour la phrase par défaut sans chiffre.
 */
export interface HomeLine {
  readonly kind: HomeLineKind;
  readonly phraseKey: string;
  readonly buttonKey: string;
  readonly value: number;
}

/** Nombre de variantes écrites par situation : on en prend une par jour de jeu, pour que l'accueil ne répète pas la même phrase. */
export const HOME_LINE_VARIANTS = 2;

/** Un record « à portée » : hier à au moins 85 % du record. */
const RECORD_REACH = 0.85;
/** Hier est « au-dessus » ou « en dessous » de la moyenne à partir de 10 % d'écart. */
const AVERAGE_MARGIN = 0.1;

export interface HomeLineInput {
  readonly recap: ReturnRecap | null;
  readonly bestScore: number | null;
  readonly streak: Streak | null;
  /** Le jour de jeu (`aaaa-mm-jj`). */
  readonly today: string;
}

/**
 * Une seule phrase d'accroche, la première qui s'applique : veille de jalon, record à portée, hier au-dessus ou en dessous de la moyenne, ses morceaux
 * trouvés au premier palier cette semaine. `null` : rien à dire (le bouton garde son libellé par défaut). Jamais un autre joueur.
 */
export function homeLine(input: HomeLineInput): HomeLine | null {
  const { recap, bestScore, streak, today } = input;
  if (!recap) return null;
  const variant = dayVariant(today);
  const line = (kind: HomeLineKind, value: number, plural?: 'one' | 'other'): HomeLine => ({
    kind,
    phraseKey: [`daily.homeLine.${kind}.${variant}.phrase`, plural].filter(Boolean).join('.'),
    buttonKey: `daily.homeLine.${kind}.${variant}.button`,
    value,
  });

  if (streak && streakMilestoneState(streak, today) === 'eve') return line('eve', streak.streak + 1);

  const yesterday = recap.yesterdayScore;
  if (yesterday !== null && bestScore !== null && bestScore > 0 && yesterday < bestScore && yesterday >= bestScore * RECORD_REACH) return line('record', bestScore);

  const average = recap.averageScore;
  if (yesterday !== null && average !== null && average > 0) {
    if (yesterday > average * (1 + AVERAGE_MARGIN)) return line('above', yesterday);
    if (yesterday < average * (1 - AVERAGE_MARGIN)) return line('below', yesterday);
  }

  if (recap.weekFirstStepFound > 0) return line('week', recap.weekFirstStepFound, recap.weekFirstStepFound > 1 ? 'other' : 'one');
  return null;
}

/** La variante du jour (0 à `HOME_LINE_VARIANTS - 1`), la même pour tous le même jour. */
export function dayVariant(today: string): number {
  const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
  return Number.isFinite(day) ? ((day % HOME_LINE_VARIANTS) + HOME_LINE_VARIANTS) % HOME_LINE_VARIANTS : 0;
}

/** Sépare une phrase déjà traduite autour du marqueur du chiffre (le chiffre est mis en orange par le gabarit). */
export const VALUE_MARKER = '§';

export function splitPhrase(text: string): { readonly before: string; readonly after: string; readonly hasValue: boolean } {
  const at = text.indexOf(VALUE_MARKER);
  return at < 0 ? { before: text, after: '', hasValue: false } : { before: text.slice(0, at), after: text.slice(at + 1), hasValue: true };
}

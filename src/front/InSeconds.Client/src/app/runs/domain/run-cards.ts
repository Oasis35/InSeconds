import { AnswerSuggestion } from '../../gameplay/domain/answer';

/**
 * Les coups de pouce du mode Run en TypeScript pur : leurs noms d'API, la main, l'offre d'un palier et le signe écrit dans le coin de
 * chaque carte. Le serveur tire, tient le compte et calcule chaque effet : le front affiche.
 */

/** Un coup de pouce, par son nom d'API (le serveur le donne, les traductions sont sous `runs.cards.<nom>`). */
export type RunCardKey =
  | 'three_choices' | 'joker' | 'year' | 'initials' | 'extend' | 'net' | 'lower_target' | 'hourglass' | 'genre' | 'either_or';

export const RUN_CARDS: readonly RunCardKey[] = [
  'three_choices', 'joker', 'year', 'initials', 'extend', 'net', 'lower_target', 'hourglass', 'genre', 'either_or',
];

export const isRunCard = (key: string): key is RunCardKey => (RUN_CARDS as readonly string[]).includes(key);

/** Une carte de la main : son numéro dans la partie (pour la jouer ou la lâcher) et la carte. */
export interface RunHandCard {
  readonly slot: number;
  readonly card: RunCardKey;
}

/** L'offre du palier qui suit une manche passée : trois cartes, à prendre (une) ou à passer. */
export interface RunCardOffer {
  readonly afterRound: number;
  readonly cards: readonly RunCardKey[];
}

/** Ce que valent les cartes de la playlist (règles figées, servies par le serveur) : l'écran les affiche, il n'en invente aucune. */
export interface RunCardValues {
  readonly extendListenSeconds: number;
  readonly hourglassSeconds: number;
  readonly lowerTargetPercent: number;
  /** Les cartes agissent tant qu'elles sont en main, sans clic (sauf le Joker) ; faux pour une playlist d'avant, dont les cartes se jouent une fois. */
  readonly durable: boolean;
  /** Durable : les secondes que la Prolongation ajoute à l'écoute. */
  readonly extendBonusSeconds: number;
}

/** Cette carte se joue d'un toucher : toutes dans une playlist d'avant, le Joker seul dans une playlist durable (les autres agissent en main). */
export const isPlayable = (card: RunCardKey, values: RunCardValues | null): boolean => !values?.durable || card === 'joker';

/**
 * La couleur d'une carte (« une couleur = un sens ») : cyan pour ce qui touche au son et au temps (la Prolongation allonge l'écoute, le Délai le
 * chrono), à la couleur du joueur pour les autres. `rgb` : la même couleur pour un fond ou un contour transparent.
 */
export function cardColor(card: RunCardKey): { readonly color: string; readonly rgb: string } {
  return card === 'extend' || card === 'hourglass'
    ? { color: 'var(--color-accent-2)', rgb: 'var(--rgb-accent-2)' }
    : { color: 'var(--color-accent)', rgb: 'var(--rgb-accent)' };
}

/**
 * Le signe d'une carte, dans son coin, à la couleur du joueur : un repère qui se lit d'un coup d'œil, à côté de son nom. Pas d'emoji ni d'icône décorative :
 * un chiffre ou un caractère qui dit l'effet. Sans les valeurs de la playlist, les cartes chiffrées n'ont que leur caractère.
 */
export function cardGlyph(card: RunCardKey, values: RunCardValues | null, lang = 'fr'): string {
  switch (card) {
    case 'three_choices':
      return '3';
    case 'joker':
      return '↻';
    case 'year':
      return '’95';
    case 'initials':
      return 'A.B.';
    case 'extend':
      if (!values) return '⏵';
      return values.durable ? `+${values.extendBonusSeconds} s` : `${values.extendListenSeconds} s`;
    case 'net':
      return values?.durable ? '¼' : '½';
    case 'lower_target':
      return values ? lowerTargetLabel(values.lowerTargetPercent, lang) : '↓';
    case 'hourglass':
      return values ? `+${values.hourglassSeconds}` : '+';
    case 'genre':
      return '♪';
    case 'either_or':
      return 'A/T';
  }
}

/**
 * Les emplacements de la main, dans l'ordre : chaque carte tenue, puis des emplacements vides (en pointillé) jusqu'à la taille de la main.
 */
export function handSlots(hand: readonly RunHandCard[], handSize: number): readonly (RunHandCard | null)[] {
  const cards = [...hand].sort((a, b) => a.slot - b.slot);
  return [...cards, ...Array.from({ length: Math.max(0, handSize - cards.length) }, () => null)];
}

/** Ce que les cartes jouées sur le morceau en cours révèlent ou changent (servi par le serveur pour lui seul). */
export interface RunTrackEffects {
  readonly cards: readonly RunCardKey[];
  readonly year: number | null;
  readonly artistInitials: readonly string[] | null;
  readonly titleInitials: readonly string[] | null;
  readonly choices: readonly AnswerSuggestion[] | null;
  readonly clockBonusSeconds: number;
  /** « Genre » : le genre de l'album du morceau (vide s'il n'en a pas en base). */
  readonly genre: string | null;
}

/** Ce qu'une carte jouée affiche dans la carte du morceau : ce qu'elle révèle (année, initiales, baisse), sinon son effet en clair. */
export interface RunPlayedCard {
  readonly card: RunCardKey;
  readonly value: string | null;
}

/** Les cartes jouées sur le morceau, dans l'ordre ; le Joker n'en laisse rien (il a changé de morceau). */
export function playedCards(effects: RunTrackEffects | null, values: RunCardValues | null, lang = 'fr'): readonly RunPlayedCard[] {
  if (!effects) return [];
  return effects.cards.filter(card => card !== 'joker').map(card => ({ card, value: playedValue(card, effects, values, lang) }));
}

/** Le pourcentage dans la typographie de la langue : « −25 % » en français (espace avant), « −25% » en anglais. */
function lowerTargetLabel(percent: number, lang: string): string {
  return lang.startsWith('fr') ? `−${percent} %` : `−${percent}%`;
}

function playedValue(card: RunCardKey, effects: RunTrackEffects, values: RunCardValues | null, lang: string): string | null {
  switch (card) {
    case 'year':
      return effects.year === null ? null : String(effects.year);
    case 'initials':
      return effects.artistInitials && effects.titleInitials
        ? `${initialsLabel(effects.artistInitials)} – ${initialsLabel(effects.titleInitials)}`
        : null;
    case 'lower_target':
      return values ? lowerTargetLabel(values.lowerTargetPercent, lang) : null;
    case 'genre':
      return effects.genre;
    default:
      return null;
  }
}

/** Les initiales d'un nom, à lire : « D. P. ». */
export const initialsLabel = (initials: readonly string[]): string => initials.map(i => `${i}.`).join(' ');

/** La main est pleine : prendre une carte demande d'en lâcher une. */
export const handFull = (hand: readonly RunHandCard[], handSize: number): boolean => handSize > 0 && hand.length >= handSize;

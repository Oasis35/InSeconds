/**
 * Les coups de pouce du mode Run (proto 2) en TypeScript pur : leurs noms d'API, la main, l'offre d'un palier et le signe écrit dans le coin de
 * chaque carte. Le serveur tire, tient le compte et calcule chaque effet : le front affiche.
 */

/** Un coup de pouce, par son nom d'API (le serveur le donne, les traductions sont sous `runs.cards.<nom>`). */
export type RunCardKey = 'three_choices' | 'joker' | 'year' | 'initials' | 'extend' | 'net' | 'lower_target' | 'hourglass';

export const RUN_CARDS: readonly RunCardKey[] = ['three_choices', 'joker', 'year', 'initials', 'extend', 'net', 'lower_target', 'hourglass'];

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

/**
 * Le signe d'une carte, dans son coin, à la couleur du joueur : un repère qui se lit d'un coup d'œil, à côté de son nom. Pas d'emoji ni d'icône décorative :
 * un chiffre ou un caractère qui dit l'effet.
 */
export function cardGlyph(card: RunCardKey): string {
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
      return '20 s';
    case 'net':
      return '½';
    case 'lower_target':
      return '−20 %';
    case 'hourglass':
      return '+30';
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
  readonly choices: readonly { readonly artist: string; readonly title: string }[] | null;
  readonly clockBonusSeconds: number;
}

/** Les initiales d'un nom, à lire : « D. P. ». */
export const initialsLabel = (initials: readonly string[]): string => initials.map(i => `${i}.`).join(' ');

/** La main est pleine : prendre une carte demande d'en lâcher une. */
export const handFull = (hand: readonly RunHandCard[], handSize: number): boolean => handSize > 0 && hand.length >= handSize;

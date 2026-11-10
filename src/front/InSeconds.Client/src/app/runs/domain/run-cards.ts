import { AnswerSuggestion } from '../../gameplay/domain/answer';

/**
 * Les coups de pouce du mode Run en TypeScript pur : leurs noms d'API et le signe écrit dans le coin de chaque carte. Le serveur tire, tient le
 * compte et calcule chaque effet : le front affiche. Trois cartes se gagnent (QCM, Indice, Prolongation) ; l'Échange (« Changer de morceau ») est
 * un lien offert à chaque manche, pas une carte.
 */

/** Un coup de pouce, par son nom d'API (le serveur le donne, les traductions sont sous `runs.cards.<nom>`). */
export type RunCardKey = 'three_choices' | 'hint' | 'extend';

export const RUN_CARDS: readonly RunCardKey[] = ['three_choices', 'hint', 'extend'];

export const isRunCard = (key: string): key is RunCardKey => (RUN_CARDS as readonly string[]).includes(key);

/** Ce que valent les cartes de la playlist (règles figées, servies par le serveur) : l'écran les affiche, il n'en invente aucune. */
export interface RunCardValues {
  /** Les secondes que la Prolongation ajoute à l'écoute. */
  readonly extendBonusSeconds: number;
  /** Une manche gagne une carte quand son score atteint l'objectif augmenté de ce pourcentage. */
  readonly rewardMarginPercent: number;
}

/**
 * La couleur d'une carte (« une couleur = un sens ») : cyan pour ce qui touche au son (la Prolongation allonge l'écoute), à la couleur du joueur
 * pour les autres. `rgb` : la même couleur pour un fond ou un contour transparent.
 */
export function cardColor(card: RunCardKey): { readonly color: string; readonly rgb: string } {
  return card === 'extend'
    ? { color: 'var(--color-accent-2)', rgb: 'var(--rgb-accent-2)' }
    : { color: 'var(--color-accent)', rgb: 'var(--rgb-accent)' };
}

/** Le signe d'une carte, dans son coin : un chiffre ou un caractère qui dit l'effet, pas d'emoji ni d'icône décorative. */
export function cardGlyph(card: RunCardKey, values: RunCardValues | null): string {
  switch (card) {
    case 'three_choices':
      return '3';
    case 'hint':
      return '’95';
    case 'extend':
      return values ? `+${values.extendBonusSeconds} s` : '⏵';
  }
}

/** Ce que les cartes actives sur le morceau en cours révèlent ou changent (servi par le serveur pour lui seul). */
export interface RunTrackEffects {
  readonly cards: readonly RunCardKey[];
  readonly year: number | null;
  readonly artistInitials: readonly string[] | null;
  readonly titleInitials: readonly string[] | null;
  readonly choices: readonly AnswerSuggestion[] | null;
  /** « Indice » : le genre de l'album du morceau (vide s'il n'en a pas en base). */
  readonly genre: string | null;
}

/** Ce qu'une carte active affiche dans la carte du morceau : ce qu'elle révèle, sinon son effet en clair. */
export interface RunPlayedCard {
  readonly card: RunCardKey;
  readonly value: string | null;
}

/** Les cartes actives sur le morceau, dans l'ordre ; l'Indice donne l'année, les initiales et le genre en une seule tuile. */
export function playedCards(effects: RunTrackEffects | null): readonly RunPlayedCard[] {
  if (!effects) return [];
  return effects.cards.map(card => ({ card, value: card === 'hint' ? hintLabel(effects) : null }));
}

/** Ce que l'Indice révèle, sur une ligne : « 1995 · D. P. – O. M. T. · Pop ». */
function hintLabel(effects: RunTrackEffects): string | null {
  const parts = [
    effects.year === null ? null : String(effects.year),
    effects.artistInitials && effects.titleInitials ? `${initialsLabel(effects.artistInitials)} – ${initialsLabel(effects.titleInitials)}` : null,
    effects.genre,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Les initiales d'un nom, à lire : « D. P. ». */
export const initialsLabel = (initials: readonly string[]): string => initials.map(i => `${i}.`).join(' ');

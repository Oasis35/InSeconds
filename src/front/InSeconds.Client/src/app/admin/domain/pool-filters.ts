import { PoolTrack, isUsed, isUsedByMode, usageOf } from './pool-track';
import { POOL_VIEW } from './pool-views';

export type StatusFilter = 'all' | 'available' | 'used' | 'disabled';
export type PreviewFilter = 'all' | 'ok' | 'missing';

/** « Joué par » : tous (`''`), aucun mode (`none`), ou un mode précis (son identifiant). */
export const PLAYED_BY_NONE = 'none';

export interface PoolFilters {
  readonly text: string;
  readonly status: StatusFilter;
  readonly preview: PreviewFilter;
  readonly playedBy: string;
  /** Bornes (incluses) sur le dernier jour d'utilisation par le mode de la vue, `yyyy-MM-dd` ; vide = pas de borne. */
  readonly lastUsedFrom: string;
  readonly lastUsedTo: string;
}

export const NO_FILTERS: PoolFilters = { text: '', status: 'all', preview: 'all', playedBy: '', lastUsedFrom: '', lastUsedTo: '' };

export function hasActiveFilters(filters: PoolFilters): boolean {
  return filters.text !== '' || filters.status !== 'all' || filters.preview !== 'all' || filters.playedBy !== ''
    || filters.lastUsedFrom !== '' || filters.lastUsedTo !== '';
}

export type SortColumn = 'artist' | 'title' | 'preview' | 'status' | 'usage' | 'lastUsedDate' | 'unlockDate' | 'usageCount';
export type SortDirection = 'asc' | 'desc';

export interface PoolSort {
  readonly column: SortColumn;
  readonly direction: SortDirection;
}

/** Nombre de morceaux affichés par page du tableau. */
export const POOL_PAGE_SIZE = 15;

/**
 * Le morceau a servi, vu de la vue : dans la vue générale, un mode au moins l'a joué ; dans la vue d'un mode,
 * ce mode-là seulement.
 */
export function isUsedIn(track: PoolTrack, view: string): boolean {
  return view === POOL_VIEW ? isUsed(track) : isUsedByMode(track, view);
}

/**
 * Le texte est cherché dans l'artiste, dans le titre, et dans « artiste titre » : une recherche
 * collée (« nicki minaj starships », piège 28) ne se trouve ni dans l'un ni dans l'autre pris à
 * part, et faisait disparaître un morceau pourtant bien présent dans le pool.
 */
function matchesText(track: PoolTrack, text: string): boolean {
  if (!text) return true;
  const artist = track.artist.toLowerCase();
  const title = track.title.toLowerCase();
  return artist.includes(text) || title.includes(text) || `${artist} ${title}`.includes(text);
}

function matchesStatus(track: PoolTrack, status: StatusFilter, view: string): boolean {
  switch (status) {
    case 'available': return !isUsedIn(track, view);
    case 'used': return isUsedIn(track, view);
    case 'disabled': return track.isDisabled;
    default: return true;
  }
}

function matchesPlayedBy(track: PoolTrack, playedBy: string): boolean {
  if (playedBy === '') return true;
  if (playedBy === PLAYED_BY_NONE) return !isUsed(track);
  return isUsedByMode(track, playedBy);
}

function matchesPreview(track: PoolTrack, preview: PreviewFilter): boolean {
  if (preview === 'ok') return track.preview === 'available';
  if (preview === 'missing') return track.preview === 'missing';
  return true;
}

function matchesLastUsed(track: PoolTrack, view: string, from: string, to: string): boolean {
  const last = usageOf(track, view)?.lastUsedDate ?? null;
  if (from && (!last || last < from)) return false;
  if (to && (!last || last > to)) return false;
  return true;
}

export function filterTracks(tracks: readonly PoolTrack[], filters: PoolFilters, view: string = POOL_VIEW): PoolTrack[] {
  const text = filters.text.toLowerCase().trim();
  return tracks.filter(track =>
    matchesText(track, text)
    && matchesStatus(track, filters.status, view)
    && matchesPlayedBy(track, filters.playedBy)
    && matchesPreview(track, filters.preview)
    && matchesLastUsed(track, view, filters.lastUsedFrom, filters.lastUsedTo));
}

/** Ordre du tri par extrait : manquant, pas encore contrôlé, disponible. */
const PREVIEW_ORDER: Readonly<Record<PoolTrack['preview'], number>> = { missing: 0, unknown: 1, available: 2 };

function sortValue(track: PoolTrack, column: SortColumn, view: string): string | number | null {
  const usage = usageOf(track, view);
  switch (column) {
    case 'artist': return track.artist.toLowerCase();
    case 'title': return track.title.toLowerCase();
    case 'preview': return PREVIEW_ORDER[track.preview];
    case 'status': return isUsedIn(track, view) ? 0 : 1;
    case 'usage': return track.usages.length;
    case 'lastUsedDate': return usage?.lastUsedDate ?? null;
    case 'unlockDate': return usage?.unlockDate ?? null;
    case 'usageCount': return usage?.usageCount ?? null;
  }
}

/**
 * Trie sans modifier la liste reçue. Sans tri choisi, les morceaux disponibles viennent d'abord, puis ceux qui ont
 * déjà servi (pour la vue : tous modes confondus dans le pool, ce mode seul dans sa vue), chaque groupe dans l'ordre
 * reçu (artiste puis titre, côté API). Avec un tri, les morceaux désactivés vont **toujours** en fin de liste, une
 * valeur vide (jamais utilisé) vient en dernier dans les deux sens, et le tri est stable : l'ordre ci-dessus
 * départage les égalités.
 */
export function sortTracks(tracks: readonly PoolTrack[], sort: PoolSort | null, view: string = POOL_VIEW): PoolTrack[] {
  const direction = sort?.direction === 'desc' ? -1 : 1;
  const byDisabled = (a: PoolTrack, b: PoolTrack) => Number(a.isDisabled) - Number(b.isDisabled);
  const byUsed = (a: PoolTrack, b: PoolTrack) => Number(isUsedIn(a, view)) - Number(isUsedIn(b, view));
  const ordered = [...tracks].sort((a, b) => byDisabled(a, b) || byUsed(a, b));
  if (!sort) return ordered;
  return ordered.sort((a, b) => {
    const disabledOrder = byDisabled(a, b);
    if (disabledOrder !== 0) return disabledOrder;
    const va = sortValue(a, sort.column, view);
    const vb = sortValue(b, sort.column, view);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * direction;
    return (va - vb) * direction;
  });
}

/** Un clic sur une colonne : la même colonne change de sens, une autre démarre en croissant. */
export function nextSort(current: PoolSort | null, column: SortColumn): PoolSort {
  if (current?.column === column) return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { column, direction: 'asc' };
}

export function totalPages(count: number, pageSize = POOL_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

/** Ramène une page (à partir de 0) dans les bornes : une page de l'adresse peut dépasser après un filtre. */
export function clampPage(page: number, count: number, pageSize = POOL_PAGE_SIZE): number {
  return Math.min(Math.max(0, Math.floor(page)), totalPages(count, pageSize) - 1);
}

export function pageOf<T>(items: readonly T[], page: number, pageSize = POOL_PAGE_SIZE): T[] {
  return items.slice(page * pageSize, (page + 1) * pageSize);
}

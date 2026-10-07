import { PoolTrack, isUsed } from './pool-track';

export type StatusFilter = 'all' | 'available' | 'used' | 'disabled';
export type PreviewFilter = 'all' | 'ok' | 'missing';

export interface PoolFilters {
  readonly text: string;
  readonly status: StatusFilter;
  readonly preview: PreviewFilter;
  /** Bornes (incluses) sur le dernier jour d'utilisation, `yyyy-MM-dd` ; vide = pas de borne. */
  readonly lastUsedFrom: string;
  readonly lastUsedTo: string;
}

export const NO_FILTERS: PoolFilters = { text: '', status: 'all', preview: 'all', lastUsedFrom: '', lastUsedTo: '' };

export function hasActiveFilters(filters: PoolFilters): boolean {
  return filters.text !== '' || filters.status !== 'all' || filters.preview !== 'all'
    || filters.lastUsedFrom !== '' || filters.lastUsedTo !== '';
}

export type SortColumn = 'artist' | 'title' | 'preview' | 'status' | 'lastUsedDate' | 'unlockDate' | 'usageCount';
export type SortDirection = 'asc' | 'desc';

export interface PoolSort {
  readonly column: SortColumn;
  readonly direction: SortDirection;
}

/** Nombre de morceaux affichés par page du tableau. */
export const POOL_PAGE_SIZE = 15;

/**
 * Nombre de morceaux par défi quand le réglage n'est pas connu du front. La valeur de production
 * vient des réglages de l'API (module Daily) : elle remplacera cette constante.
 */
export const DEFAULT_TRACKS_PER_CHALLENGE = 5;

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

function matchesStatus(track: PoolTrack, status: StatusFilter): boolean {
  switch (status) {
    case 'available': return !isUsed(track);
    case 'used': return isUsed(track);
    case 'disabled': return track.isDisabled;
    default: return true;
  }
}

function matchesPreview(track: PoolTrack, preview: PreviewFilter): boolean {
  if (preview === 'ok') return track.preview === 'available';
  if (preview === 'missing') return track.preview === 'missing';
  return true;
}

function matchesLastUsed(track: PoolTrack, from: string, to: string): boolean {
  if (from && (!track.lastUsedDate || track.lastUsedDate < from)) return false;
  if (to && (!track.lastUsedDate || track.lastUsedDate > to)) return false;
  return true;
}

export function filterTracks(tracks: readonly PoolTrack[], filters: PoolFilters): PoolTrack[] {
  const text = filters.text.toLowerCase().trim();
  return tracks.filter(track =>
    matchesText(track, text)
    && matchesStatus(track, filters.status)
    && matchesPreview(track, filters.preview)
    && matchesLastUsed(track, filters.lastUsedFrom, filters.lastUsedTo));
}

/** Ordre du tri par extrait : manquant, pas encore contrôlé, disponible. */
const PREVIEW_ORDER: Readonly<Record<PoolTrack['preview'], number>> = { missing: 0, unknown: 1, available: 2 };

function sortValue(track: PoolTrack, column: SortColumn): string | number | null {
  switch (column) {
    case 'artist': return track.artist.toLowerCase();
    case 'title': return track.title.toLowerCase();
    case 'preview': return PREVIEW_ORDER[track.preview];
    case 'status': return isUsed(track) ? 0 : 1;
    case 'lastUsedDate': return track.lastUsedDate;
    case 'unlockDate': return track.unlockDate;
    case 'usageCount': return track.usageCount;
  }
}

/**
 * Trie sans modifier la liste reçue. Sans tri choisi, l'ordre est celui de la v1 : les morceaux
 * disponibles d'abord, puis ceux qui ont déjà servi, chaque groupe dans l'ordre reçu (artiste puis
 * titre, côté API). Avec un tri, les morceaux désactivés vont **toujours** en fin de liste, une
 * valeur vide (jamais utilisé) vient en dernier dans les deux sens, et le tri est stable : l'ordre
 * ci-dessus départage les égalités.
 */
export function sortTracks(tracks: readonly PoolTrack[], sort: PoolSort | null): PoolTrack[] {
  const direction = sort?.direction === 'desc' ? -1 : 1;
  const byDisabled = (a: PoolTrack, b: PoolTrack) => Number(a.isDisabled) - Number(b.isDisabled);
  const byUsed = (a: PoolTrack, b: PoolTrack) => Number(isUsed(a)) - Number(isUsed(b));
  const ordered = [...tracks].sort((a, b) => byDisabled(a, b) || byUsed(a, b));
  if (!sort) return ordered;
  return ordered.sort((a, b) => {
    const disabledOrder = byDisabled(a, b);
    if (disabledOrder !== 0) return disabledOrder;
    const va = sortValue(a, sort.column);
    const vb = sortValue(b, sort.column);
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

/**
 * Autonomie du pool : morceaux jamais utilisés, avec un extrait (ou pas encore contrôlé) et non
 * désactivés, ce que le tirage peut encore proposer, divisés par le nombre de morceaux d'un défi.
 */
export function poolDaysRemaining(tracks: readonly PoolTrack[], tracksPerChallenge: number): number {
  const drawable = tracks.filter(t => !isUsed(t) && t.preview !== 'missing' && !t.isDisabled).length;
  return Math.floor(drawable / Math.max(1, tracksPerChallenge));
}

export type RunwayTone = 'low' | 'medium' | 'high';

export function runwayTone(days: number): RunwayTone {
  if (days < 3) return 'low';
  if (days < 7) return 'medium';
  return 'high';
}

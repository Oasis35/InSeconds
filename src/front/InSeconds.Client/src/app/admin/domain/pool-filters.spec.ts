import {
  NO_FILTERS, PoolFilters, clampPage, filterTracks, hasActiveFilters, nextSort, pageOf,
  sortTracks, totalPages,
} from './pool-filters';
import { isValidTrackName, trackLabel } from './pool-track';
import { poolTrack as track } from './testing/pool-track.fixture';

const filters = (overrides: Partial<PoolFilters>): PoolFilters => ({ ...NO_FILTERS, ...overrides });

describe('filterTracks', () => {
  const eminem = track({ id: 1, artist: 'Eminem', title: 'Lose Yourself', usageCount: 1, lastUsedDate: '2026-10-07' });
  const nicki = track({ id: 2, artist: 'Nicki Minaj', title: 'Starships', preview: 'missing' });
  const queen = track({ id: 3, artist: 'Queen', title: 'Bohemian Rhapsody', usageCount: 1, lastUsedDate: '2026-10-02', isDisabled: true });
  const all = [eminem, nicki, queen];

  it('ne filtre rien sans filtre', () => {
    expect(filterTracks(all, NO_FILTERS)).toEqual(all);
  });

  it('cherche dans l\'artiste, dans le titre, sans tenir compte de la casse', () => {
    expect(filterTracks(all, filters({ text: 'EMINEM' }))).toEqual([eminem]);
    expect(filterTracks(all, filters({ text: 'bohemian' }))).toEqual([queen]);
  });

  it('trouve un morceau par « artiste titre » collés (piège 28)', () => {
    expect(filterTracks(all, filters({ text: 'nicki minaj starships' }))).toEqual([nicki]);
    expect(filterTracks(all, filters({ text: '  Nicki Minaj Starships ' }))).toEqual([nicki]);
  });

  it('distingue disponible, utilisé et désactivé', () => {
    expect(filterTracks(all, filters({ status: 'available' }))).toEqual([nicki]);
    expect(filterTracks(all, filters({ status: 'used' }))).toEqual([eminem, queen]);
    expect(filterTracks(all, filters({ status: 'disabled' }))).toEqual([queen]);
  });

  it('filtre par état de l\'extrait', () => {
    expect(filterTracks(all, filters({ preview: 'missing' }))).toEqual([nicki]);
    expect(filterTracks(all, filters({ preview: 'ok' }))).toEqual([eminem, queen]);
  });

  it('filtre par plage de dernière utilisation, bornes incluses, sans date exclu', () => {
    expect(filterTracks(all, filters({ lastUsedFrom: '2026-10-02', lastUsedTo: '2026-10-02' }), 'daily')).toEqual([queen]);
    expect(filterTracks(all, filters({ lastUsedFrom: '2026-10-03' }), 'daily')).toEqual([eminem]);
    expect(filterTracks(all, filters({ lastUsedTo: '2026-10-06' }), 'daily')).toEqual([queen]);
  });

  it('combine les filtres', () => {
    expect(filterTracks(all, filters({ status: 'used', preview: 'ok', text: 'queen' }))).toEqual([queen]);
    expect(filterTracks(all, filters({ status: 'available', text: 'queen' }))).toEqual([]);
  });

  it('sait si un filtre est actif', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ lastUsedTo: '2026-10-01' }))).toBe(true);
  });
});

describe('sortTracks', () => {
  const a = track({ id: 1, artist: 'Adele', usageCount: 7, lastUsedDate: '2026-07-09', unlockDate: '2026-08-08' });
  const b = track({ id: 2, artist: 'Beyoncé', usageCount: 0 });
  const c = track({ id: 3, artist: 'Coldplay', usageCount: 2, lastUsedDate: '2026-10-05', unlockDate: '2026-11-04' });

  it('met les morceaux disponibles avant ceux qui ont servi, dans l\'ordre reçu, sans tri', () => {
    expect(sortTracks([c, a, b], null)).toEqual([b, c, a]);
  });

  it('garde cet ordre pour départager les égalités d\'un tri', () => {
    const used = track({ id: 4, artist: 'Zed', usageCount: 1 });
    const free = track({ id: 5, artist: 'Zed', usageCount: 0 });
    expect(sortTracks([used, free], { column: 'artist', direction: 'asc' }).map(t => t.id)).toEqual([5, 4]);
  });

  it('ne modifie pas la liste reçue', () => {
    const list = [c, a, b];
    sortTracks(list, { column: 'artist', direction: 'asc' });
    expect(list).toEqual([c, a, b]);
  });

  it('trie par texte, dans les deux sens', () => {
    expect(sortTracks([c, a, b], { column: 'artist', direction: 'asc' })).toEqual([a, b, c]);
    expect(sortTracks([c, a, b], { column: 'artist', direction: 'desc' })).toEqual([c, b, a]);
  });

  it('trie par nombre d\'utilisations', () => {
    expect(sortTracks([a, b, c], { column: 'usageCount', direction: 'desc' }, 'daily').map(t => t.id)).toEqual([1, 3, 2]);
  });

  it('met toujours les valeurs vides en dernier, quel que soit le sens', () => {
    expect(sortTracks([a, b, c], { column: 'lastUsedDate', direction: 'asc' }, 'daily').map(t => t.id)).toEqual([1, 3, 2]);
    expect(sortTracks([a, b, c], { column: 'lastUsedDate', direction: 'desc' }, 'daily').map(t => t.id)).toEqual([3, 1, 2]);
  });

  it('met toujours les morceaux désactivés en fin de liste', () => {
    const off = track({ id: 9, artist: 'Abba', isDisabled: true });
    expect(sortTracks([off, c, a], null).map(t => t.id)).toEqual([3, 1, 9]);
    expect(sortTracks([off, c, a], { column: 'artist', direction: 'asc' }).map(t => t.id)).toEqual([1, 3, 9]);
    expect(sortTracks([off, c, a], { column: 'artist', direction: 'desc' }).map(t => t.id)).toEqual([3, 1, 9]);
  });

  it('trie par état de l\'extrait : manquant, inconnu, disponible', () => {
    const missing = track({ id: 1, preview: 'missing' });
    const unknown = track({ id: 2, preview: 'unknown' });
    const ok = track({ id: 3, preview: 'available' });
    expect(sortTracks([ok, missing, unknown], { column: 'preview', direction: 'asc' }).map(t => t.id)).toEqual([1, 2, 3]);
  });
});

describe('nextSort', () => {
  it('démarre en croissant sur une nouvelle colonne', () => {
    expect(nextSort(null, 'artist')).toEqual({ column: 'artist', direction: 'asc' });
    expect(nextSort({ column: 'artist', direction: 'desc' }, 'title')).toEqual({ column: 'title', direction: 'asc' });
  });

  it('change de sens sur la même colonne', () => {
    expect(nextSort({ column: 'artist', direction: 'asc' }, 'artist')).toEqual({ column: 'artist', direction: 'desc' });
    expect(nextSort({ column: 'artist', direction: 'desc' }, 'artist')).toEqual({ column: 'artist', direction: 'asc' });
  });
});

describe('pagination', () => {
  it('compte au moins une page', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(15)).toBe(1);
    expect(totalPages(16)).toBe(2);
  });

  it('ramène la page dans les bornes', () => {
    expect(clampPage(5, 20)).toBe(1);
    expect(clampPage(-3, 20)).toBe(0);
    expect(clampPage(1.9, 40)).toBe(1);
    expect(clampPage(2, 0)).toBe(0);
  });

  it('découpe une page', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(pageOf(items, 0)).toHaveLength(15);
    expect(pageOf(items, 1)).toEqual([15, 16, 17, 18, 19]);
  });
});

describe('morceau', () => {
  it('nomme « artiste — titre »', () => {
    expect(trackLabel({ artist: 'Eminem', title: 'Lose Yourself' })).toBe('Eminem — Lose Yourself');
  });

  it('exige deux noms non vides dans les limites de l\'API', () => {
    expect(isValidTrackName('A', 'T')).toBe(true);
    expect(isValidTrackName('  ', 'T')).toBe(false);
    expect(isValidTrackName('A', '')).toBe(false);
    expect(isValidTrackName('a'.repeat(201), 'T')).toBe(false);
    expect(isValidTrackName('A', 't'.repeat(301))).toBe(false);
    expect(isValidTrackName('a'.repeat(200), 't'.repeat(300))).toBe(true);
  });
});

describe('vues par mode', () => {
  const daily = track({ id: 1, artist: 'Eminem', usageCount: 2, lastUsedDate: '2026-10-07' });
  const otherModeOnly = track({
    id: 2, artist: 'Autre', usedByMode: true,
    usages: [{ mode: 'autre', usageCount: 0, lastUsedDate: null, unlockDate: null, inTodayChallenge: false }],
  });
  const never = track({ id: 3, artist: 'Jamais' });

  it('« joué par » : un mode, aucun mode, ou tous', () => {
    expect(filterTracks([daily, otherModeOnly, never], filters({ playedBy: 'daily' })).map(t => t.id)).toEqual([1]);
    expect(filterTracks([daily, otherModeOnly, never], filters({ playedBy: 'autre' })).map(t => t.id)).toEqual([2]);
    expect(filterTracks([daily, otherModeOnly, never], filters({ playedBy: 'none' })).map(t => t.id)).toEqual([3]);
    expect(filterTracks([daily, otherModeOnly, never], filters({ playedBy: '' }))).toHaveLength(3);
  });

  it('« disponible » dans le pool : aucun mode ne l\'a joué ; dans la vue d\'un mode : ce mode seul', () => {
    expect(filterTracks([daily, otherModeOnly, never], filters({ status: 'available' }), 'pool').map(t => t.id)).toEqual([3]);
    expect(filterTracks([daily, otherModeOnly, never], filters({ status: 'available' }), 'daily').map(t => t.id)).toEqual([2, 3]);
    expect(filterTracks([daily, otherModeOnly, never], filters({ status: 'used' }), 'daily').map(t => t.id)).toEqual([1]);
  });

  it('la plage de dates porte sur le mode de la vue', () => {
    expect(filterTracks([daily, never], filters({ lastUsedFrom: '2026-10-01' }), 'daily').map(t => t.id)).toEqual([1]);
    expect(filterTracks([daily, never], filters({ lastUsedFrom: '2026-10-01' }), 'autre')).toEqual([]);
  });

  it('trie sur les valeurs du mode de la vue, les vides en dernier', () => {
    const more = track({ id: 4, artist: 'Plus', usageCount: 5 });
    expect(sortTracks([daily, never, more], { column: 'usageCount', direction: 'desc' }, 'daily').map(t => t.id)).toEqual([4, 1, 3]);
    expect(sortTracks([daily, otherModeOnly, never], { column: 'usage', direction: 'desc' }).map(t => t.id)).toEqual([1, 2, 3]);
  });

  it('a des filtres actifs dès que « joué par » est choisi', () => {
    expect(hasActiveFilters(filters({ playedBy: 'daily' }))).toBe(true);
  });
});

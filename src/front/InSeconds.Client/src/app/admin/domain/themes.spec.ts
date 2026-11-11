import { poolTrack } from './testing/pool-track.fixture';
import {
  MIN_PLAYABLE_TRACKS, VARIED_FROM_TRACKS, filterByLabel, filterThemes, isPlayableTrack, missingTracks, themeHealth, themeRows,
} from './themes';

describe('themes', () => {
  it('range un thème selon le nombre de morceaux jouables : rouge sous 7, jaune de 7 à 13, vert à partir de 14', () => {
    expect(themeHealth(0)).toBe('unplayable');
    expect(themeHealth(MIN_PLAYABLE_TRACKS - 1)).toBe('unplayable');
    expect(themeHealth(MIN_PLAYABLE_TRACKS)).toBe('thin');
    expect(themeHealth(VARIED_FROM_TRACKS - 1)).toBe('thin');
    expect(themeHealth(VARIED_FROM_TRACKS)).toBe('varied');
  });

  it('dit combien de morceaux jouables manquent, jamais moins de zéro', () => {
    expect(missingTracks(4)).toBe(3);
    expect(missingTracks(7)).toBe(0);
    expect(missingTracks(20)).toBe(0);
  });

  it('ne compte comme jouable qu\'un morceau avec extrait, pas désactivé', () => {
    expect(isPlayableTrack(poolTrack())).toBe(true);
    expect(isPlayableTrack(poolTrack({ isDisabled: true }))).toBe(false);
    expect(isPlayableTrack(poolTrack({ preview: 'missing' }))).toBe(false);
    expect(isPlayableTrack(poolTrack({ preview: 'unknown' }))).toBe(false);
  });

  it('compte, par thème, les morceaux du pool et ceux que le tirage peut prendre, par nom', () => {
    const tracks = [
      poolTrack({ id: 1, themeIds: [1, 2] }), poolTrack({ id: 2, themeIds: [1], isDisabled: true }), poolTrack({ id: 3, themeIds: [] }),
    ];

    const rows = themeRows([{ id: 2, name: 'Films' }, { id: 1, name: 'Années 80' }], tracks);

    expect(rows).toEqual([
      { id: 1, name: 'Années 80', icon: null, total: 2, playable: 1, health: 'unplayable' },
      { id: 2, name: 'Films', icon: null, total: 1, playable: 1, health: 'unplayable' },
    ]);
  });

  it('filtre les thèmes par nom (accents et casse ignorés) et par état', () => {
    const rows = [
      { id: 1, name: 'Années 80', icon: null, total: 4, playable: 4, health: 'unplayable' as const },
      { id: 2, name: 'Films', icon: null, total: 20, playable: 20, health: 'varied' as const },
    ];

    expect(filterThemes(rows, 'annees', 'all').map(r => r.id)).toEqual([1]);
    expect(filterThemes(rows, '', 'varied').map(r => r.id)).toEqual([2]);
    expect(filterThemes(rows, 'films', 'unplayable')).toEqual([]);
  });

  it('filtre des morceaux sur « artiste titre »', () => {
    const tracks = [poolTrack({ id: 1, artist: 'Beyoncé', title: 'Halo' }), poolTrack({ id: 2, artist: 'Toto', title: 'Africa' })];

    expect(filterByLabel(tracks, 'beyonce halo').map(t => t.id)).toEqual([1]);
    expect(filterByLabel(tracks, '')).toHaveLength(2);
  });
});

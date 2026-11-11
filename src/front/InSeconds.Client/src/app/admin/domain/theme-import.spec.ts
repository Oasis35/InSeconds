import { PoolTheme } from './pool-track';
import { poolTrack } from './testing/pool-track.fixture';
import { assignmentsOf, exclusionKey, parseClassification, poolToCsv, previewImport, totalToAdd } from './theme-import';

describe('theme-import', () => {
  const themes: PoolTheme[] = [
    { id: 1, name: 'Années 80', trackCount: 1, icon: null },
    { id: 2, name: 'Rock', trackCount: 0, icon: null },
  ];
  const tracks = [
    poolTrack({ id: 10, artist: 'a-ha', title: 'Take On Me', releaseYear: 1985, genres: ['Pop'], themeIds: [1] }),
    poolTrack({ id: 11, artist: 'Toto', title: 'Africa', releaseYear: 1982 }),
    poolTrack({ id: 12, artist: 'AC/DC', title: 'Thunderstruck' }),
  ];

  describe('parseClassification', () => {
    it('lit « thème ; id », plusieurs identifiants, les tabulations et ignore vides et commentaires', () => {
      const parsed = parseClassification('# mon classement\n\nRock ; 12\nAnnées 80\t11\nRock ; 10, 11\n');

      expect(parsed.issues).toEqual([]);
      expect(parsed.lines.map(l => [l.themeName, l.trackId])).toEqual([['Rock', 12], ['Années 80', 11], ['Rock', 10], ['Rock', 11]]);
    });

    it('ignore l\'en-tête de la première ligne mais signale les lignes illisibles', () => {
      const parsed = parseClassification('thème ; id\nRock ; 12\nn\'importe quoi\nRock ; abc\n');

      expect(parsed.lines).toHaveLength(1);
      expect(parsed.issues.map(i => i.line)).toEqual([3, 4]);
    });

    it('signale une première ligne mal formée au lieu de la prendre pour un en-tête', () => {
      const parsed = parseClassification('Rock ; 12a\nRock ; 12');

      expect(parsed.issues.map(i => i.line)).toEqual([1]);
      expect(parsed.lines).toHaveLength(1);
    });

    it('accepte un nom de thème entre guillemets et un BOM', () => {
      const parsed = parseClassification('﻿"Rock ; roll"; 12');

      expect(parsed.lines[0]).toMatchObject({ themeName: 'Rock ; roll', trackId: 12 });
    });
  });

  describe('previewImport', () => {
    it('reconnaît les thèmes sans la casse ni les accents, marque les déjà-là et signale les inconnus', () => {
      const preview = previewImport(parseClassification('annees 80 ; 10\nannees 80 ; 11\nrock ; 12\nrock ; 12\nFilms ; 11\nrock ; 999'), themes, tracks);

      expect(preview.groups.map(g => [g.themeName, g.themeId, g.toAdd])).toEqual([['Années 80', 1, 1], ['Rock', 2, 1], ['Films', null, 0]]);
      expect(preview.groups[0].tracks.map(t => t.alreadyIn)).toEqual([true, false]);
      expect(preview.groups[1].tracks).toHaveLength(1);
      expect(preview.unknownTracks.map(l => l.trackId)).toEqual([999]);
      expect(totalToAdd(preview)).toBe(2);
    });

    it('ne compte plus un morceau décoché', () => {
      const parsed = parseClassification('Rock ; 12\nRock ; 11');
      const excluded = new Set([exclusionKey(2, 11)]);

      const preview = previewImport(parsed, themes, tracks, excluded);

      expect(totalToAdd(preview)).toBe(1);
      expect(assignmentsOf(preview, excluded)).toEqual([{ themeId: 2, trackIds: [12] }]);
    });

    it('n\'envoie rien pour un thème inconnu ni pour un morceau déjà dans le thème', () => {
      const preview = previewImport(parseClassification('Films ; 11\nAnnées 80 ; 10'), themes, tracks);

      expect(assignmentsOf(preview)).toEqual([]);
    });
  });

  describe('poolToCsv', () => {
    it('écrit une ligne par morceau avec année, genres et thèmes, et protège les séparateurs', () => {
      const csv = poolToCsv([...tracks, poolTrack({ id: 13, artist: 'Guns; "N" Roses', title: 'Yo' })], themes);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      const lines = csv.slice(1).trim().split('\r\n');

      expect(lines[0]).toBe('id;artiste;titre;année;genres;thèmes');
      expect(lines[1]).toBe('10;a-ha;Take On Me;1985;Pop;Années 80');
      expect(lines[3]).toBe('12;AC/DC;Thunderstruck;;;');
      expect(lines[4]).toBe('13;"Guns; ""N"" Roses";Yo;;;');
    });
  });
});

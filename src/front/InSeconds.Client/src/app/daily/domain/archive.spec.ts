import { ArchiveDay, ArchiveTrack, artistsSummary, formatGameDate, isDateText, monthGrid, mostMissedPosition } from './archive';

const ARCHIVE_TRACK = (position: number, over: Partial<ArchiveTrack> = {}): ArchiveTrack => ({
  position, artist: `Artiste ${position}`, title: `Titre ${position}`, releaseYear: null, deezerTrackId: position, coverUrl: null,
  artistFoundPercent: 50, titleFoundPercent: 50, guessSteps: [], notFoundPercent: 10, ...over,
});

const ARCHIVE_DAY = (over: Partial<ArchiveDay> = {}): ArchiveDay => ({
  date: '2026-10-21', previousDate: null, nextDate: null, hasStats: true, medianScore: 2000, minScore: 0, maxScore: 4000,
  maxPossibleScore: 5000, scoreDistribution: [], tracks: [ARCHIVE_TRACK(1)], ...over,
});

describe('archive (domaine)', () => {
  it('reconnaît une date aaaa-mm-jj qui existe', () => {
    expect(isDateText('2026-10-21')).toBe(true);
    expect(isDateText('2026-02-31')).toBe(false);
    expect(isDateText('2026-10-2')).toBe(false);
    expect(isDateText('hier')).toBe(false);
    expect(isDateText(null)).toBe(false);
  });

  it('le plus raté : le plus de « rien trouvé », le premier en cas d égalité, rien sans statistiques', () => {
    const day = ARCHIVE_DAY({
      tracks: [ARCHIVE_TRACK(1, { notFoundPercent: 20 }), ARCHIVE_TRACK(2, { notFoundPercent: 60 }), ARCHIVE_TRACK(3, { notFoundPercent: 60 })],
    });
    expect(mostMissedPosition(day)).toBe(2);
    expect(mostMissedPosition({ ...day, hasStats: false })).toBeNull();
    expect(mostMissedPosition({ ...day, tracks: [ARCHIVE_TRACK(1, { notFoundPercent: 0 })] })).toBeNull();
  });

  it('résume les artistes du jour pour le titre de la page', () => {
    const day = ARCHIVE_DAY({
      tracks: ['Daft Punk', 'Stromae', 'Daft Punk', 'Eminem', 'Adele'].map((artist, i) => ARCHIVE_TRACK(i + 1, { artist })),
    });
    expect(artistsSummary(day)).toBe('Daft Punk, Stromae, Eminem…');
    expect(artistsSummary({ ...day, tracks: day.tracks.slice(0, 2) })).toBe('Daft Punk, Stromae');
  });

  it('écrit la date dans la langue, sans dépendre du fuseau', () => {
    expect(formatGameDate('2026-10-21', 'fr')).toBe('21 octobre 2026');
    expect(formatGameDate('2026-10-21', 'fr', 'weekday')).toBe('mercredi 21 octobre');
    expect(formatGameDate('2026-10-21', 'en')).toBe('21 October 2026');
  });

  it('découpe un mois en semaines du lundi au dimanche', () => {
    const weeks = monthGrid(2026, 10, new Set(['2026-10-21']));
    // Le 1er octobre 2026 est un jeudi : trois cases vides avant.
    expect(weeks[0].slice(0, 4).map(c => c?.day ?? null)).toEqual([null, null, null, 1]);
    expect(weeks.flat().filter(c => c !== null)).toHaveLength(31);
    expect(weeks.flat().filter(c => c?.published).map(c => c!.date)).toEqual(['2026-10-21']);
    expect(weeks.every(w => w.length === 7)).toBe(true);
  });
});

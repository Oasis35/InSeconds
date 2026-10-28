import { Provider } from '@angular/core';
import { DailyApi } from '../daily.api';
import {
  AnswerToSend, AnsweredTrack, DailySettings, DailyToday, DayStats, StartOutcome, StartedSession,
} from '../../domain/daily';
import { EMPTY_STREAK } from '../../domain/streak';
import { ArchiveDay, ArchiveMe, ArchiveTrack, NOBODY } from '../../domain/archive';

export const SETTINGS: DailySettings = {
  guessTimerSeconds: 20,
  tracksPerChallenge: 3,
  allowedDurationsSeconds: [0.5, 1, 2, 5],
  hints: [
    { level: 1, unlockSeconds: 5, kind: 'year', penaltyPercent: 30 },
    { level: 2, unlockSeconds: 10, kind: 'artistMasked', penaltyPercent: 60 },
  ],
};

export const TODAY = (over: Partial<DailyToday> = {}): DailyToday => ({
  state: 'can_start', tracksCount: 3, completedCount: 0, streak: EMPTY_STREAK, completedGames: 0, bestScore: null, yesterdayMedian: null, ...over,
});

export const SESSION = (over: Partial<StartedSession> = {}): StartedSession => ({
  sessionId: 11,
  tracks: [1, 2, 3].map(position => ({ position, previewUrl: `https://cdn.example/${position}.mp3` })),
  streak: EMPTY_STREAK,
  isResuming: false,
  nextPosition: 1,
  completedAnswers: [],
  currentTrack: null,
  ...over,
});

export const ANSWERED = (position: number, over: Partial<AnsweredTrack> = {}): AnsweredTrack => ({
  position, artistCorrect: true, titleCorrect: true, score: 850, listenedSeconds: 1, hintLevel: 0,
  correctArtist: `Artiste ${position}`, correctTitle: `Titre ${position}`, deezerTrackId: 100 + position, coverUrl: `https://cdn.example/c${position}.jpg`,
  averageSecondsWhenCorrect: 1.5, distribution: [{ durationSeconds: 1, count: 4 }], notFoundCount: 1, ...over,
});

export const STATS = (over: Partial<DayStats> = {}): DayStats => ({
  yourScore: 2550, medianScore: 1500, totalPlayers: 4, currentStreak: 3, tracks: [], freezesUsed: 0, freezeMilestone: false,
  minScore: 0, maxScore: 3000, maxPossibleScore: 3000, scoreDistribution: [], betterThanPercent: 50, ...over,
});

export const ARCHIVE_TRACK = (position: number, over: Partial<ArchiveTrack> = {}): ArchiveTrack => ({
  position, artist: `Artiste ${position}`, title: `Titre ${position}`, releaseYear: 2000 + position, deezerTrackId: 100 + position,
  coverUrl: `https://cdn.example/c${position}.jpg`, artistFoundPercent: 70, titleFoundPercent: 60,
  guessSteps: [{ durationSeconds: 0.5, percent: 10 }, { durationSeconds: 1, percent: 40 }, { durationSeconds: 2, percent: 20 }, { durationSeconds: 5, percent: 10 }],
  notFoundPercent: 10 * position, ...over,
});

export const ARCHIVE_DAY = (over: Partial<ArchiveDay> = {}): ArchiveDay => ({
  date: '2026-10-21', previousDate: '2026-10-20', nextDate: null, hasStats: true, medianScore: 2250, minScore: 0, maxScore: 4250,
  maxPossibleScore: 3000,
  scoreDistribution: Array.from({ length: 10 }, (_, i) => ({ minScore: i * 300, maxScore: i * 300 + 299, percent: i === 4 ? 40 : 6 })),
  tracks: [1, 2, 3].map(p => ARCHIVE_TRACK(p)), ...over,
});

export const ARCHIVE_ME = (over: Partial<ArchiveMe> = {}): ArchiveMe => ({
  played: true, score: 2150, betterThanPercent: 46,
  answers: [
    { position: 1, artistCorrect: true, titleCorrect: true, listenedSeconds: 0.5, score: 1000 },
    { position: 2, artistCorrect: true, titleCorrect: false, listenedSeconds: 1, score: 850 },
    { position: 3, artistCorrect: false, titleCorrect: false, listenedSeconds: 5, score: 0 },
  ],
  ...over,
});

/**
 * Un faux jeu du jour pour tester les stores sans réseau : les réponses sont fixées par le test (valeur, ou erreur levée), les appels
 * sont notés dans `calls`.
 */
export class FakeDailyApi {
  today: DailyToday | Error = TODAY();
  settings: DailySettings | Error = SETTINGS;
  start: StartOutcome | Error = { kind: 'ok', session: SESSION() };
  stats: DayStats | Error = STATS();
  gamesPlayed: number | Error = 2559;
  archiveDates: string[] | Error = ['2026-10-21', '2026-10-20'];
  /** Les jours publiés, par date ; une date absente n'est pas publiée (`null`). */
  archiveDays: Record<string, ArchiveDay | Error> = { '2026-10-21': ARCHIVE_DAY() };
  archiveMe: ArchiveMe | Error = NOBODY;
  archivePreview: string | null | Error = 'https://preview/archive.mp3';
  /** La réponse du serveur à chaque réponse envoyée ; `Error` pour un échec. */
  answer: (answer: AnswerToSend) => AnsweredTrack | Error = a => ANSWERED(a.position);
  hintFacts: readonly { kind: string; value: string | null }[] = [{ kind: 'year', value: '2013' }];
  readonly calls: string[] = [];

  private result<T>(value: T | Error): Promise<T> {
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  }

  todayCall(): Promise<DailyToday> {
    this.calls.push('today');
    return this.result(this.today);
  }

  settingsCall(): Promise<DailySettings> {
    this.calls.push('settings');
    return this.result(this.settings);
  }

  startCall(): Promise<StartOutcome> {
    this.calls.push('start');
    return this.result(this.start);
  }

  updateListening(sessionId: number, position: number, seconds: number): Promise<void> {
    this.calls.push(`listening ${sessionId}/${position}/${seconds}`);
    return Promise.resolve();
  }

  requestHint(sessionId: number, position: number, level: number): Promise<readonly { kind: string; value: string | null }[]> {
    this.calls.push(`hint ${sessionId}/${position}/${level}`);
    return Promise.resolve(this.hintFacts);
  }

  submitAnswer(sessionId: number, answer: AnswerToSend): Promise<AnsweredTrack> {
    this.calls.push(`answer ${sessionId}/${answer.position}/${answer.listenedSeconds}`);
    return this.result(this.answer(answer));
  }

  abandon(sessionId: number): Promise<void> {
    this.calls.push(`abandon ${sessionId}`);
    return Promise.resolve();
  }

  gamesPlayedCall(): Promise<number> {
    this.calls.push('gamesPlayed');
    return this.result(this.gamesPlayed);
  }

  archiveDatesCall(): Promise<string[]> {
    this.calls.push('archiveDates');
    return this.result(this.archiveDates);
  }

  archiveDayCall(date: string): Promise<ArchiveDay | null> {
    this.calls.push(`archiveDay ${date}`);
    return this.result(this.archiveDays[date] ?? null);
  }

  myArchiveDayCall(date: string): Promise<ArchiveMe> {
    this.calls.push(`myArchiveDay ${date}`);
    return this.result(this.archiveMe);
  }

  archivePreviewCall(date: string, position: number): Promise<string | null> {
    this.calls.push(`archivePreview ${date} ${position}`);
    return this.result(this.archivePreview);
  }

  statsCall(): Promise<DayStats> {
    this.calls.push('stats');
    return this.result(this.stats);
  }
}

/** Branche le faux sous le vrai nom des méthodes de `DailyApi` (`today`, `settings`, `start`, `stats`, `gamesPlayed` sont des champs de données du faux). */
export function provideFakeDailyApi(fake: FakeDailyApi): Provider {
  return {
    provide: DailyApi,
    useValue: {
      today: () => fake.todayCall(),
      settings: () => fake.settingsCall(),
      start: () => fake.startCall(),
      updateListening: (s: number, p: number, sec: number) => fake.updateListening(s, p, sec),
      requestHint: (s: number, p: number, l: number) => fake.requestHint(s, p, l),
      submitAnswer: (s: number, a: AnswerToSend) => fake.submitAnswer(s, a),
      abandon: (s: number) => fake.abandon(s),
      stats: () => fake.statsCall(),
      gamesPlayed: () => fake.gamesPlayedCall(),
      archiveDates: () => fake.archiveDatesCall(),
      archiveDay: (date: string) => fake.archiveDayCall(date),
      myArchiveDay: (date: string) => fake.myArchiveDayCall(date),
      archivePreviewUrl: (date: string, position: number) => fake.archivePreviewCall(date, position),
    } satisfies Partial<Record<keyof DailyApi, unknown>>,
  };
}

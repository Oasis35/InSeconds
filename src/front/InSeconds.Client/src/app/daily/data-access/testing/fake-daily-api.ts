import { Provider } from '@angular/core';
import { DailyApi } from '../daily.api';
import {
  AnswerToSend, AnsweredTrack, DailySettings, DailyToday, DayStats, StartOutcome, StartedSession, SubmitOutcome,
} from '../../domain/daily';
import { EMPTY_STREAK } from '../../domain/streak';
import { ArchiveDay, ArchiveMe, ArchiveTrack, NOBODY } from '../../domain/archive';
import { DailyHistory } from '../../domain/history';
import { ReplayFilter, ReplayPage } from '../../domain/replay';
import { EarProfile, ProfilePeriod } from '../../domain/ear-profile';

export const SETTINGS: DailySettings = {
  guessTimerSeconds: 20,
  tracksPerChallenge: 3,
  allowedDurationsSeconds: [0.5, 1, 2, 5],
  durationScores: [{ seconds: 0.5, score: 1000 }, { seconds: 1, score: 850 }, { seconds: 2, score: 550 }, { seconds: 5, score: 250 }],
  hints: [
    { level: 1, unlockSeconds: 5, kind: 'year', penaltyPercent: 30 },
    { level: 2, unlockSeconds: 10, kind: 'artistMasked', penaltyPercent: 60 },
  ],
  retryScorePercent: 70,
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
  archiveDates: string[] | Error = ['2026-10-21', '2026-10-20'];
  /** Les jours publiés, par date ; une date absente n'est pas publiée (`null`). */
  archiveDays: Record<string, ArchiveDay | Error> = { '2026-10-21': ARCHIVE_DAY() };
  archiveMe: ArchiveMe | Error = NOBODY;
  archivePreview: string | null | Error = 'https://preview/archive.mp3';
  /** L'historique d'un mois (le mois demandé est noté dans `calls`). */
  history: DailyHistory | Error = HISTORY();
  /** Les pages de « À réécouter », par jour de départ (`''` : la première). */
  replayPages: Record<string, ReplayPage | Error> = { '': REPLAY_PAGE() };
  earProfile: EarProfile | null | Error = EAR_PROFILE();
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

  /** Combien de prochaines réponses le serveur refuse en offrant une seconde tentative (rien n'est compté ni révélé). */
  retriesToOffer = 0;

  submitAnswer(sessionId: number, answer: AnswerToSend): Promise<SubmitOutcome> {
    this.calls.push(`answer ${sessionId}/${answer.position}/${answer.listenedSeconds}`);
    if (this.retriesToOffer > 0) {
      this.retriesToOffer--;
      return Promise.resolve({ kind: 'retry' });
    }
    const outcome = this.answer(answer);
    return this.result(outcome).then<SubmitOutcome>(answered => ({ kind: 'answered', answered }));
  }

  /** Vrai : l'abandon échoue (le serveur ne répond pas). */
  abandonError = false;

  abandon(sessionId: number): Promise<void> {
    this.calls.push(`abandon ${sessionId}`);
    return this.abandonError ? Promise.reject(new Error('abandon')) : Promise.resolve();
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

  historyCall(month: string | null): Promise<DailyHistory> {
    this.calls.push(`history ${month ?? ''}`);
    return this.result(this.history);
  }

  replayCall(filter: ReplayFilter, before: string | null): Promise<ReplayPage> {
    this.calls.push(`replay ${filter} ${before ?? ''}`);
    return this.result(this.replayPages[before ?? ''] ?? { days: [], nextBefore: null, allCount: 0, noneCount: 0, halfCount: 0 });
  }

  earProfileCall(period: ProfilePeriod): Promise<EarProfile | null> {
    this.calls.push(`earProfile ${period}`);
    return this.result(this.earProfile);
  }

  statsCall(): Promise<DayStats> {
    this.calls.push('stats');
    return this.result(this.stats);
  }
}

/** Branche le faux sous le vrai nom des méthodes de `DailyApi` (`today`, `settings`, `start`, `stats` sont des champs de données du faux). */
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
      archiveDates: () => fake.archiveDatesCall(),
      archiveDay: (date: string) => fake.archiveDayCall(date),
      myArchiveDay: (date: string) => fake.myArchiveDayCall(date),
      archivePreviewUrl: (date: string, position: number) => fake.archivePreviewCall(date, position),
      history: (month: string | null) => fake.historyCall(month),
      replay: (filter: ReplayFilter, before: string | null) => fake.replayCall(filter, before),
      earProfile: (period: ProfilePeriod) => fake.earProfileCall(period),
    } satisfies Partial<Record<keyof DailyApi, unknown>>,
  };
}

export const HISTORY = (over: Partial<DailyHistory> = {}): DailyHistory => ({
  month: '2026-11',
  previousMonth: '2026-10',
  nextMonth: null,
  days: [
    { date: '2026-11-18', state: 'missed', score: null, maxPossibleScore: 5000 },
    { date: '2026-11-19', state: 'played', score: 2140, maxPossibleScore: 5000 },
    { date: '2026-11-20', state: 'today', score: null, maxPossibleScore: 5000 },
  ],
  monthPlayedCount: 1,
  monthPublishedCount: 2,
  monthAverageScore: 2140,
  monthBestScore: 2140,
  ...over,
});

export const REPLAY_PAGE = (over: Partial<ReplayPage> = {}): ReplayPage => ({
  days: [
    {
      date: '2026-11-19',
      tracks: [
        { position: 2, artist: 'Marguerite Vale', title: 'Fil de soie', deezerTrackId: 1002, coverUrl: null, artistCorrect: false, titleCorrect: false },
        { position: 4, artist: 'Cap Nord', title: 'Rue des Lilas', deezerTrackId: 1004, coverUrl: null, artistCorrect: true, titleCorrect: false },
      ],
    },
  ],
  nextBefore: null,
  allCount: 2,
  noneCount: 1,
  halfCount: 1,
  ...over,
});

export const EAR_PROFILE = (over: Partial<EarProfile> = {}): EarProfile => ({
  period: '8w',
  points: [
    { start: '2026-11-09', average: 1800, playersAverage: 1900, games: 3 },
    { start: '2026-11-16', average: 2180, playersAverage: 1950, games: 4 },
  ],
  averageScore: 2000,
  trendPercent: 12,
  gamesPlayed: 7,
  bestScore: 3100,
  bestStreak: 14,
  firstStepSeconds: 0.5,
  firstStepFound: 11,
  steps: [
    { seconds: 0.5, percent: 10, playersPercent: 5 },
    { seconds: 1, percent: 20, playersPercent: 12 },
    { seconds: 2, percent: 30, playersPercent: 22 },
  ],
  notFoundPercent: 40,
  playersNotFoundPercent: 61,
  artistFoundPercent: 78,
  titleFoundPercent: 61,
  playersArtistFoundPercent: 66,
  playersTitleFoundPercent: 54,
  ...over,
});

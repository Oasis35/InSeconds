import { Injectable, inject } from '@angular/core';
import { firstValueFrom, retry, throwError, timer } from 'rxjs';
import {
  DailyClient, DailySettingsResponse, GuessBucketResponse, ResumedAnswer, StartSessionResponse, StreakResponse, SubmitAnswerResponse, TodayResponse,
  TodayStatsResponse,
} from '../../api/daily/api.generated';
import { toAppError } from '../../core/errors/app-error';
import {
  AnswerToSend, AnsweredTrack, DailySettings, DailyToday, DayStats, GuessBucket, StartOutcome, StartedSession, TodayState,
} from '../domain/daily';
import { Streak } from '../domain/streak';

/** Des réponses d'erreur que le jeu connaît : refus du démarrage (la partie est finie, pas de défi). */
const ALREADY_PLAYED = 'daily.already_played';
const ABANDONED = 'daily.abandoned';
const NO_CHALLENGE = 'daily.no_challenge';

/** Combien de fois on renvoie une réponse que le réseau ou le serveur ont fait échouer (piège 32), et l'attente entre deux essais. */
const SUBMIT_RETRIES = 2;
const SUBMIT_RETRY_DELAY_MS = 1000;

/**
 * Adaptateur de l'API du module Daily : seule porte d'entrée vers le client généré (`api/daily`). Il rend des types du domaine
 * (dates en texte, `null` plutôt que `undefined`) et des promesses ; les erreurs sont celles du client (`toAppError` sait les lire).
 */
@Injectable({ providedIn: 'root' })
export class DailyApi {
  private readonly client = inject(DailyClient);

  async today(): Promise<DailyToday> {
    return toToday(await firstValueFrom(this.client.getToday()));
  }

  async settings(): Promise<DailySettings> {
    return toSettings(await firstValueFrom(this.client.getDailySettings()));
  }

  /** Démarre la partie du jour, ou la reprend ; les refus du jeu (déjà jouée, abandonnée, pas de défi) sont des issues, pas des erreurs. */
  async start(): Promise<StartOutcome> {
    try {
      return { kind: 'ok', session: toSession(await firstValueFrom(this.client.startSession())) };
    } catch (error) {
      const { code } = await toAppError(error);
      if (code === ALREADY_PLAYED) return { kind: 'already_played', abandoned: false };
      if (code === ABANDONED) return { kind: 'already_played', abandoned: true };
      if (code === NO_CHALLENGE) return { kind: 'no_challenge' };
      return { kind: 'error' };
    }
  }

  /** Pose le plus long palier écouté sur le morceau en cours : le serveur débloque les indices et fixe le plancher anti-triche (piège 35). */
  async updateListening(sessionId: number, position: number, listenedSeconds: number): Promise<void> {
    await firstValueFrom(this.client.updateListening(sessionId, { position, listenedSeconds }));
  }

  /** Demande un niveau d'indice ; rend tous les indices révélés jusqu'à lui (cumulés). */
  async requestHint(sessionId: number, position: number, level: number): Promise<readonly { kind: string; value: string | null }[]> {
    const { facts } = await firstValueFrom(this.client.requestHint(sessionId, { position, level }));
    return facts.map(f => ({ kind: f.kind, value: f.value ?? null }));
  }

  /**
   * Envoie la réponse. Une coupure réseau ou une erreur serveur est retentée (2 fois, 1 s d'écart) : sans enregistrement, la partie ne se
   * termine jamais côté serveur. Une erreur applicative (4xx : déjà répondu, palier trop court) remonte tout de suite (piège 32).
   */
  async submitAnswer(sessionId: number, answer: AnswerToSend): Promise<AnsweredTrack> {
    const body = {
      position: answer.position,
      listenedSeconds: answer.listenedSeconds,
      wasExtended: answer.wasExtended,
      artist: answer.artist ?? undefined,
      title: answer.title ?? undefined,
    };
    const request = this.client.submitAnswer(sessionId, body).pipe(
      retry({ count: SUBMIT_RETRIES, delay: error => (isRetryable(error) ? timer(SUBMIT_RETRY_DELAY_MS) : throwError(() => error)) }),
    );
    return toAnswered(answer.position, await firstValueFrom(request));
  }

  async abandon(sessionId: number): Promise<void> {
    await firstValueFrom(this.client.abandonSession(sessionId));
  }

  async stats(): Promise<DayStats> {
    return toStats(await firstValueFrom(this.client.getTodayStats()));
  }
}

/** Une coupure réseau (statut 0) ou une erreur du serveur (5xx) : la réponse est renvoyée ; un refus applicatif (4xx) ne l'est jamais. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && (status === 0 || status >= 500);
}

/** `aaaa-mm-jj` : le client annonce une `Date` mais le JSON livre un texte (et l'adaptateur ne doit pas dépendre du fuseau du navigateur). */
function toDateText(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10);
  return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

function toStreak(streak: StreakResponse): Streak {
  return {
    status: streak.status === 'protected' || streak.status === 'broken' ? streak.status : 'active',
    streak: streak.streak,
    freezes: streak.freezes,
    maxFreezes: streak.maxFreezes,
    freezeEveryDays: streak.freezeEveryDays,
    nextFreezeInDays: streak.nextFreezeInDays ?? null,
    missedDays: streak.missedDays,
    lostStreak: streak.lostStreak ?? null,
    lastPlayedDate: toDateText(streak.lastPlayedDate),
  };
}

function toToday(today: TodayResponse): DailyToday {
  return {
    state: today.state as TodayState,
    tracksCount: today.tracksCount,
    completedCount: today.completedCount,
    streak: toStreak(today.streak),
  };
}

function toSettings(settings: DailySettingsResponse): DailySettings {
  return {
    guessTimerSeconds: settings.guessTimerSeconds,
    tracksPerChallenge: settings.tracksPerChallenge,
    allowedDurationsSeconds: settings.allowedDurationsSeconds,
    hints: settings.hints.map(h => ({ level: h.level, unlockSeconds: h.unlockSeconds, kind: h.kind, penaltyPercent: h.penaltyPercent })),
  };
}

const toBuckets = (buckets: readonly GuessBucketResponse[]): GuessBucket[] =>
  buckets.map(b => ({ durationSeconds: b.durationSeconds, count: b.count }));

function toAnswered(position: number, r: SubmitAnswerResponse): AnsweredTrack {
  return {
    position,
    artistCorrect: r.artistCorrect,
    titleCorrect: r.titleCorrect,
    score: r.score,
    listenedSeconds: r.listenedSeconds,
    hintLevel: r.hintLevelUsed,
    correctArtist: r.correctArtist,
    correctTitle: r.correctTitle,
    deezerTrackId: r.deezerTrackId,
    coverUrl: r.coverUrl ?? null,
    averageSecondsWhenCorrect: r.averageSecondsWhenCorrect ?? null,
    failureRatePercent: r.failureRatePercent,
    distribution: toBuckets(r.guessTimeDistribution),
    notFoundCount: r.notFoundCount,
  };
}

function toResumed(a: ResumedAnswer): AnsweredTrack {
  return {
    position: a.position,
    artistCorrect: a.artistCorrect,
    titleCorrect: a.titleCorrect,
    score: a.score,
    listenedSeconds: a.listenedSeconds,
    hintLevel: a.hintLevel,
    correctArtist: a.correctArtist,
    correctTitle: a.correctTitle,
    deezerTrackId: a.deezerTrackId,
    coverUrl: a.coverUrl ?? null,
    // La reprise ne redonne pas les chiffres des autres joueurs : le récap les lit dans les statistiques du jour.
    averageSecondsWhenCorrect: null,
    failureRatePercent: null,
    distribution: [],
    notFoundCount: 0,
  };
}

function toSession(r: StartSessionResponse): StartedSession {
  return {
    sessionId: r.sessionId,
    tracks: r.tracks.map(t => ({ position: t.position, previewUrl: t.previewUrl })),
    streak: toStreak(r.streak),
    isResuming: r.isResuming,
    nextPosition: r.nextPosition,
    completedAnswers: r.completedAnswers.map(toResumed),
    currentTrack: r.currentTrack
      ? {
          position: r.currentTrack.position,
          listenedSeconds: r.currentTrack.listenedSeconds,
          hintLevel: r.currentTrack.hintLevel,
          hintFacts: r.currentTrack.hintFacts.map(f => ({ kind: f.kind, value: f.value ?? null })),
        }
      : null,
  };
}

function toStats(s: TodayStatsResponse): DayStats {
  return {
    yourScore: s.yourScore ?? null,
    medianScore: s.medianScore,
    totalPlayers: s.totalPlayers,
    currentStreak: s.currentStreak,
    tracks: s.tracks.map(t => ({
      position: t.position,
      artist: t.artist,
      title: t.title,
      deezerTrackId: t.deezerTrackId,
      coverUrl: t.coverUrl ?? null,
      failureRatePercent: t.failureRatePercent,
      averageSecondsWhenCorrect: t.averageSecondsWhenCorrect ?? null,
      artistCorrect: t.artistCorrect ?? null,
      titleCorrect: t.titleCorrect ?? null,
      listenedSeconds: t.listenedSeconds ?? null,
      score: t.score ?? null,
      distribution: toBuckets(t.guessTimeDistribution),
      notFoundCount: t.notFoundCount,
    })),
    freezesUsed: s.freezesUsed,
    freezeMilestone: s.freezeMilestone,
    minScore: s.minScore ?? null,
    maxScore: s.maxScore ?? null,
    maxPossibleScore: s.maxPossibleScore,
    scoreDistribution: s.scoreDistribution.map(b => ({ minScore: b.minScore, maxScore: b.maxScore, count: b.count })),
    betterThanPercent: s.betterThanPercent ?? null,
  };
}

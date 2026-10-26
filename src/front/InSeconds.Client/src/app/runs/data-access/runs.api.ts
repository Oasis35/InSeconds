import { Injectable, inject } from '@angular/core';
import { firstValueFrom, retry, throwError, timer } from 'rxjs';
import {
  RunCurrentTrackResponse, RunFinishResponse, RunNeutralizedResponse, RunPlayResponse, RunRecordResponse, RunRoundResponse, RunRoundScoreResponse,
  RunRoundSummaryResponse, RunSessionResponse, RunTrackResponse, RunsClient, RunsMeResponse,
} from '../../api/runs/api.generated';
import { toAppError } from '../../core/errors/app-error';
import {
  RunCurrentTrack, RunFinish, RunNeutralized, RunPlay, RunRecord, RunRound, RunRoundScore, RunRoundSummary, RunSession, RunStatus, RunTrack, RunsMe,
} from '../domain/run';

/** Les refus que le jeu connaît : ils deviennent des issues, pas des erreurs. */
const ACCESS_DENIED = 'runs.access_denied';
const NO_CHALLENGE = 'runs.no_challenge';
const ALREADY_PLAYED = 'runs.already_played';
const ABANDONED = 'runs.abandoned';

/** Combien de fois on renvoie une réponse que le réseau ou le serveur ont fait échouer (piège 32), et l'attente entre deux essais. */
const SUBMIT_RETRIES = 2;
const SUBMIT_RETRY_DELAY_MS = 1000;

/** Le lancement ou la reprise d'une partie : réussi, ou un refus que le jeu connaît. */
export type StartOutcome =
  | { readonly kind: 'ok'; readonly play: RunPlay }
  | { readonly kind: 'access_denied' }
  | { readonly kind: 'no_challenge' }
  | { readonly kind: 'already_played'; readonly abandoned: boolean }
  | { readonly kind: 'error' };

/** La réponse à un morceau : le texte saisi (vide : passer). */
export interface RunAnswerToSend {
  readonly position: number;
  readonly artist: string | null;
  readonly title: string | null;
}

/**
 * Adaptateur de l'API du module Runs : seule porte d'entrée vers le client généré (`api/runs`). Il rend des types du domaine (`null` plutôt que
 * `undefined`) et des promesses ; les erreurs sont celles du client (`toAppError` sait les lire).
 */
@Injectable()
export class RunsApi {
  private readonly client = inject(RunsClient);

  /** Mon accès, mon record et ma partie en cours. Ne crée rien. */
  async me(): Promise<RunsMe> {
    return toMe(await firstValueFrom(this.client.getRunsMe()));
  }

  /** L'état d'une partie, en lecture seule et sans extrait (l'écran de reprise). */
  async session(sessionId: number): Promise<RunSession> {
    return toSession(await firstValueFrom(this.client.getRunSession(sessionId)));
  }

  /** Lance une playlist neuve et la partie de son auteur. */
  launch(): Promise<StartOutcome> {
    return this.start(() => this.client.launchRun());
  }

  /** Reprend la partie d'une playlist (ou la relève, pour un ami qui a reçu le lien). */
  join(code: string): Promise<StartOutcome> {
    return this.start(() => this.client.joinRun(code));
  }

  /**
   * Redemande l'extrait du morceau en cours (la signature Deezer expire, piège 14). Le serveur peut y neutraliser le morceau (extrait introuvable) :
   * la réponse dit alors quel est le morceau à jouer maintenant.
   */
  async refreshPreview(sessionId: number): Promise<RunPlay> {
    return toPlay(await firstValueFrom(this.client.refreshRunPreview(sessionId)));
  }

  /**
   * Envoie la réponse. Une coupure réseau ou une erreur serveur est retentée (2 fois, 1 s d'écart) : sans enregistrement, la partie ne se termine
   * jamais côté serveur. Une erreur applicative (4xx : déjà répondu, mauvais morceau) remonte tout de suite (piège 32).
   */
  async submitAnswer(sessionId: number, answer: RunAnswerToSend): Promise<RunPlay> {
    const request = this.client.submitRunAnswer(sessionId, { position: answer.position, artist: answer.artist ?? undefined, title: answer.title ?? undefined }).pipe(
      retry({ count: SUBMIT_RETRIES, delay: error => (isRetryable(error) ? timer(SUBMIT_RETRY_DELAY_MS) : throwError(() => error)) }),
    );
    return toPlay(await firstValueFrom(request));
  }

  async abandon(sessionId: number): Promise<void> {
    await firstValueFrom(this.client.abandonRun(sessionId));
  }

  private async start(call: () => ReturnType<RunsClient['launchRun']>): Promise<StartOutcome> {
    try {
      return { kind: 'ok', play: toPlay(await firstValueFrom(call())) };
    } catch (error) {
      const { code } = await toAppError(error);
      if (code === ACCESS_DENIED) return { kind: 'access_denied' };
      if (code === NO_CHALLENGE) return { kind: 'no_challenge' };
      if (code === ALREADY_PLAYED) return { kind: 'already_played', abandoned: false };
      if (code === ABANDONED) return { kind: 'already_played', abandoned: true };
      return { kind: 'error' };
    }
  }
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && (status === 0 || status >= 500);
}

function toStatus(status: string): RunStatus {
  return status === 'won' || status === 'lost' || status === 'abandoned' ? status : 'pending';
}

function toRecord(record: RunRecordResponse | undefined): RunRecord | null {
  return record ? { bestScore: record.bestScore, bestRoundsPassed: record.bestRoundsPassed, isNew: record.isNew } : null;
}

function toMe(me: RunsMeResponse): RunsMe {
  return {
    hasAccess: me.hasAccess,
    record: toRecord(me.record),
    pending: me.pending ? { sessionId: me.pending.sessionId, challengeCode: me.pending.challengeCode } : null,
  };
}

export function toTrack(track: RunTrackResponse): RunTrack {
  return {
    position: track.position,
    round: track.round,
    neutralized: track.neutralized,
    artistCorrect: track.artistCorrect,
    titleCorrect: track.titleCorrect,
    points: track.points,
    artist: track.artist ?? null,
    title: track.title ?? null,
    coverUrl: track.coverUrl ?? null,
    deezerTrackId: track.deezerTrackId ?? null,
  };
}

function toRound(round: RunRoundResponse | undefined): RunRound | null {
  return round ? { round: round.round, score: round.score, objective: round.objective, maxScore: round.maxScore } : null;
}

function toRoundScore(round: RunRoundScoreResponse): RunRoundScore {
  return { round: round.round, score: round.score ?? null, objective: round.objective ?? null, passed: round.passed };
}

function toFinish(finish: RunFinishResponse | undefined): RunFinish | null {
  if (!finish) return null;
  return {
    status: toStatus(finish.status),
    disc: { key: finish.disc.key, stars: finish.disc.stars },
    totalScore: finish.totalScore,
    roundsPassed: finish.roundsPassed,
    foundCount: finish.foundCount,
    trackCount: finish.trackCount,
    tracks: finish.tracks.map(toTrack),
    rounds: finish.rounds.map(toRoundScore),
    record: toRecord(finish.record),
    challengeCode: finish.challengeCode,
  };
}

function toSession(session: RunSessionResponse): RunSession {
  return {
    sessionId: session.sessionId,
    challengeCode: session.challengeCode,
    status: toStatus(session.status),
    rounds: session.rounds,
    tracksPerRound: session.tracksPerRound,
    listenSeconds: session.listenSeconds,
    totalScore: session.totalScore,
    roundsPassed: session.roundsPassed,
    round: toRound(session.round),
    roundTracks: session.roundTracks.map(toTrack),
    finish: toFinish(session.finish),
  };
}

function toCurrent(current: RunCurrentTrackResponse | undefined): RunCurrentTrack | null {
  return current
    ? { position: current.position, round: current.round, positionInRound: current.positionInRound, previewUrl: current.previewUrl || null }
    : null;
}

function toNeutralized(item: RunNeutralizedResponse): RunNeutralized {
  return { position: item.position, round: item.round, objectiveBefore: item.objectiveBefore, objectiveAfter: item.objectiveAfter };
}

function toSummary(summary: RunRoundSummaryResponse): RunRoundSummary {
  return {
    round: summary.round,
    passed: summary.passed,
    score: summary.score,
    objective: summary.objective,
    tracks: summary.tracks.map(toTrack),
    totalScore: summary.totalScore,
  };
}

export function toPlay(play: RunPlayResponse): RunPlay {
  return {
    session: toSession(play.session),
    revealed: play.revealed ? toTrack(play.revealed) : null,
    neutralized: play.neutralized.map(toNeutralized),
    roundSummaries: play.roundSummaries.map(toSummary),
    current: toCurrent(play.current),
    isResuming: play.isResuming,
  };
}

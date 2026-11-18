import { Injectable, inject } from '@angular/core';
import { firstValueFrom, retry, throwError, timer } from 'rxjs';
import {
  RunChallengeResponse, RunComparisonResponse, RunCurrentTrackResponse, RunFinishResponse, RunHistoryResponse, RunNeutralizedResponse, RunPassedRoundResponse, RunPlayResponse, RunRecordResponse, RunRoundResponse, RunRoundScoreResponse,
  RunRoundSummaryResponse, RunSessionResponse, RunTrackResponse, RunsClient, RunsMeResponse, RunLevelResponse, RunReceivedChallengeResponse,
} from '../../api/runs/api.generated';
import { toAppError } from '../../core/errors/app-error';
import {
  RunComparison, RunCurrentTrack, RunFinish, RunLink, RunNeutralized, RunPassedRound, RunPlay, RunRecord, RunRound, RunRoundScore,
  RunRoundSummary, RunSession, RunStatus, RunRoundOutcome, RunTrack, RunsMe, RunLevel, RunReceivedChallenge, RunDiscChange, NO_DISC,
} from '../domain/run';
import { RunHistory } from '../domain/run-history';
import { RunHit } from '../domain/run-hits';

/** Les refus que le jeu connaît : ils deviennent des issues, pas des erreurs. */
const ACCESS_DENIED = 'runs.access_denied';
const NO_CHALLENGE = 'runs.no_challenge';
const ALREADY_PLAYED = 'runs.already_played';
const ABANDONED = 'runs.abandoned';
const CHALLENGE_NOT_FOUND = 'runs.challenge_not_found';

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

/** Ce que le lien d'une playlist a donné : sa description, une playlist inconnue, ou une erreur. */
export type LinkOutcome =
  | { readonly kind: 'ok'; readonly link: RunLink }
  | { readonly kind: 'not_found' }
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

  /** Ce que montre le lien d'une playlist (anonyme permis) : son auteur, ses règles, et la partie de ce joueur dessus. */
  async challenge(code: string): Promise<LinkOutcome> {
    try {
      return { kind: 'ok', link: toLink(await firstValueFrom(this.client.getRunChallenge(code))) };
    } catch (error) {
      return (await toAppError(error)).code === CHALLENGE_NOT_FOUND ? { kind: 'not_found' } : { kind: 'error' };
    }
  }

  /** Les joueurs de la playlist, après la fin de sa propre partie (409 `runs.comparison_locked` sinon). */
  async comparison(code: string): Promise<RunComparison> {
    return toComparison(await firstValueFrom(this.client.getRunComparison(code)));
  }

  /**
   * Les setlists finies du joueur sur un mois (`aaaa-mm` ; le mois en cours sans mois), avec le résumé de toutes ses parties. Un navigateur que le
   * serveur ne connaît pas encore (401) n'a rien joué : un historique vide, pas une erreur.
   */
  async history(month: string | null): Promise<RunHistory> {
    try {
      return toHistory(await firstValueFrom(this.client.getRunHistory(month ?? undefined)));
    } catch (error) {
      if ((await toAppError(error)).status === 401) return { month: month ?? '', previousMonth: null, nextMonth: null, playedCount: 0, averageScore: null, bestScore: null, runs: [] };
      throw error;
    }
  }

  /** Les Hits du joueur sur ses parties finies, dans l'ordre de l'écran. Un navigateur que le serveur ne connaît pas (401) n'en a aucun à montrer. */
  async hits(): Promise<RunHit[]> {
    try {
      const response = await firstValueFrom(this.client.getRunHits());
      return response.hits.map(hit => ({ key: hit.key, earned: hit.earned, progress: hit.progress ?? null, target: hit.target ?? null }));
    } catch (error) {
      if ((await toAppError(error)).status === 401) return [];
      throw error;
    }
  }

  /** Une adresse neuve pour l'extrait d'un morceau joué d'une partie finie (elle expire en 15 min, piège 14) ; `null` si Deezer n'en a pas. */
  async pastPreviewUrl(sessionId: number, position: number): Promise<string | null> {
    return (await firstValueFrom(this.client.getRunPastPreview(sessionId, position))).previewUrl ?? null;
  }

  /** Note que ce compte a ouvert la playlist d'un ami : le défi le suit sur son accueil pendant 7 jours. Sans effet pour un invité ou pour l'auteur. */
  async receive(code: string): Promise<void> {
    await firstValueFrom(this.client.receiveRunChallenge(code));
  }

  /** Refuse le défi d'un ami (la croix du bandeau). */
  async dismissReceived(code: string): Promise<void> {
    await firstValueFrom(this.client.dismissRunChallenge(code));
  }

  /** Lance une playlist neuve et la partie de son auteur ; le thème de la manche à thème se choisit plus tard, juste avant elle. */
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

  /** Choisit le thème de la manche à thème (le créateur seulement) : `themeId` vide pour « Thème mystère », que le serveur tire. */
  async chooseTheme(sessionId: number, round: number, themeId: number | null): Promise<RunPlay> {
    return toPlay(await firstValueFrom(this.client.chooseRunTheme(sessionId, { round, themeId: themeId ?? undefined })));
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

  /**
   * Le premier son du morceau en cours est sorti : le chrono part (une seule fois, le serveur garde la première annonce et la borne). Un
   * échec n'empêche pas de jouer : sans annonce, le serveur fait partir le chrono à sa limite après l'envoi de l'extrait.
   */
  /** Annonce le premier son du morceau ; rend ce qui reste au chrono retenu par le serveur (`null` sans chrono). */
  async startClock(sessionId: number, position: number): Promise<number | null> {
    const clock = await firstValueFrom(this.client.startRunClock(sessionId, { position }));
    return clock?.clockRemainingSeconds ?? null;
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
  return status === 'lost' || status === 'completed' || status === 'abandoned' ? status : 'pending';
}

function toLink(link: RunChallengeResponse): RunLink {
  return {
    code: link.code,
    authorPseudo: link.authorPseudo ?? null,
    lives: link.lives,
    tracksPerRound: link.tracksPerRound,
    listenSeconds: link.listenSeconds,
    answerSeconds: link.answerSeconds,
    myStatus: link.myStatus === 'none' ? 'none' : toStatus(link.myStatus),
    mySessionId: link.mySessionId ?? null,
    themes: (link.themes ?? []).map(t => ({ round: t.round, name: t.name })),
  };
}

function toComparison(comparison: RunComparisonResponse): RunComparison {
  return {
    code: comparison.code,
    authorPseudo: comparison.authorPseudo ?? null,
    playerCount: comparison.playerCount,
    roundCount: comparison.roundCount,
    rows: comparison.rows.map(row => ({
      pseudo: row.pseudo ?? null,
      roundsPassed: row.roundsPassed,
      rounds: row.rounds.map(score => score ?? null),
      totalScore: row.totalScore,
      isMe: row.isMe,
      tag: row.tag ?? null,
    })),
  };
}

function toRecord(record: RunRecordResponse | undefined): RunRecord | null {
  return record ? { bestScore: record.bestScore, bestRoundsPassed: record.bestRoundsPassed, isNew: record.isNew } : null;
}

function toMe(me: RunsMeResponse): RunsMe {
  return {
    hasAccess: me.hasAccess,
    record: toRecord(me.record),
    pending: me.pending ? { sessionId: me.pending.sessionId, challengeCode: me.pending.challengeCode } : null,
    level: toLevel(me.level),
    received: toReceived(me.received),
  };
}

function toReceived(received: RunReceivedChallengeResponse | undefined): RunReceivedChallenge | null {
  if (!received) return null;
  return { code: received.code, authorPseudo: received.authorPseudo ?? null, scoreToBeat: received.scoreToBeat ?? null, expiresAt: toIsoText(received.expiresAt) };
}

function toDiscChange(change: string | null | undefined): RunDiscChange | null {
  return change === 'up' || change === 'down' || change === 'same' ? change : null;
}

function toLevel(level: RunLevelResponse | undefined): RunLevel | null {
  if (!level) return null;
  return {
    points: level.points,
    disc: level.disc ? { key: level.disc.key, stars: level.disc.stars } : { key: NO_DISC, stars: 0 },
    nextDisc: level.nextDisc ? { key: level.nextDisc.key, stars: level.nextDisc.stars } : null,
    pointsToNext: level.pointsToNext ?? null,
    progressPercent: level.progressPercent,
    runsPlayed: level.runsPlayed,
    delta: level.delta ?? null,
    discChange: toDiscChange(level.discChange),
    inactivityLoss: level.inactivityLoss,
    discDropInDays: level.discDropInDays ?? null,
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
    waveform: track.waveform ?? null,
  };
}

function toPassedRound(round: RunPassedRoundResponse): RunPassedRound {
  return { round: round.round, score: round.score, listenSeconds: round.listenSeconds, theme: round.theme ?? null };
}

function toRound(round: RunRoundResponse | undefined): RunRound | null {
  return round ? { round: round.round, score: round.score, listenSeconds: round.listenSeconds, fullPoints: round.fullPoints, failed: round.failed } : null;
}

function toRoundScore(round: RunRoundScoreResponse): RunRoundScore {
  return { round: round.round, score: round.score ?? null, listenSeconds: round.listenSeconds, theme: round.theme ?? null };
}

function toFinish(finish: RunFinishResponse | undefined): RunFinish | null {
  if (!finish) return null;
  return {
    status: toStatus(finish.status),
    totalScore: finish.totalScore,
    roundsPassed: finish.roundsPassed,
    foundCount: finish.foundCount,
    trackCount: finish.trackCount,
    tracks: finish.tracks.map(toTrack),
    rounds: finish.rounds.map(toRoundScore),
    record: toRecord(finish.record),
    challengeCode: finish.challengeCode,
    livesLeft: finish.livesLeft ?? 0,
    lifeBonus: finish.lifeBonus ?? 0,
    completeBonus: finish.completeBonus ?? 0,
    level: toLevel(finish.level),
  };
}

function toSession(session: RunSessionResponse): RunSession {
  return {
    sessionId: session.sessionId,
    challengeCode: session.challengeCode,
    status: toStatus(session.status),
    tracksPerRound: session.tracksPerRound,
    lives: session.lives,
    livesLeft: session.livesLeft,
    maxRounds: session.maxRounds ?? 0,
    totalScore: session.totalScore,
    roundsPassed: session.roundsPassed,
    round: toRound(session.round),
    roundTracks: session.roundTracks.map(toTrack),
    finish: toFinish(session.finish),
    answerSeconds: session.answerSeconds ?? 0,
    clockRemainingSeconds: session.clockRemainingSeconds ?? null,
    playedTracks: (session.playedTracks ?? []).map(toTrack),
    passedRounds: (session.passedRounds ?? []).map(toPassedRound),
    listenLadder: session.listenLadder ?? [],
    themeChoice: session.themeChoice
      ? {
          round: session.themeChoice.round,
          themes: session.themeChoice.themes.map(t => ({ id: t.id, name: t.name, round: t.round, icon: t.icon ?? null })),
        }
      : null,
    ghost: session.ghost
      ? { pseudo: session.ghost.pseudo ?? null, total: session.ghost.total, stoppedAtRound: session.ghost.stoppedAtRound ?? null }
      : null,
    themes: (session.themes ?? []).map(t => ({ round: t.round, name: t.name })),
  };
}

function toCurrent(current: RunCurrentTrackResponse | undefined): RunCurrentTrack | null {
  return current
    ? {
        position: current.position, round: current.round, positionInRound: current.positionInRound, previewUrl: current.previewUrl || null,
        listenSeconds: current.listenSeconds, waveform: current.waveform ?? null,
      }
    : null;
}

function toNeutralized(item: RunNeutralizedResponse): RunNeutralized {
  return { position: item.position, round: item.round };
}

function toOutcome(outcome: string): RunRoundOutcome {
  return outcome === 'shorter' || outcome === 'longer' ? outcome : 'same';
}

function toSummary(summary: RunRoundSummaryResponse): RunRoundSummary {
  return {
    round: summary.round,
    score: summary.score,
    outcome: toOutcome(summary.outcome),
    listenSeconds: summary.listenSeconds,
    nextListenSeconds: summary.nextListenSeconds,
    tracks: summary.tracks.map(toTrack),
    totalScore: summary.totalScore,
    livesLeft: summary.livesLeft,
    lifeRegained: summary.lifeRegained ?? false,
    fullPoints: summary.fullPoints,
    nextFullPoints: summary.nextFullPoints,
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

/** Un instant en texte ISO : le client annonce une `Date` mais le JSON livre un texte (sans quoi `toISOString` plantait et la V4 disparaissait). */
function toIsoText(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** `aaaa-mm-jj` : le client annonce une `Date` mais le JSON livre un texte (et l'adaptateur ne doit pas dépendre du fuseau du navigateur). */
function toDateText(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value instanceof Date ? value.toISOString().slice(0, 10) : '';
}

function toHistory(history: RunHistoryResponse): RunHistory {
  return {
    month: history.month,
    previousMonth: history.previousMonth ?? null,
    nextMonth: history.nextMonth ?? null,
    playedCount: history.playedCount,
    averageScore: history.averageScore ?? null,
    bestScore: history.bestScore ?? null,
    runs: history.runs.map(run => ({
      sessionId: run.sessionId,
      date: toDateText(run.date),
      challengeCode: run.challengeCode,
      status: toStatus(run.status),
      roundsPassed: run.roundsPassed,
      score: run.score,
    })),
  };
}

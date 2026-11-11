import { Injectable, inject } from '@angular/core';
import { firstValueFrom, retry, throwError, timer } from 'rxjs';
import {
  RunChallengeResponse, RunComparisonResponse, RunCurrentTrackResponse, RunFinishResponse, RunNeutralizedResponse, RunPassedRoundResponse, RunPlayResponse, RunRecordResponse, RunRoundResponse, RunRoundScoreResponse,
  RunRoundSummaryResponse, RunSessionResponse, RunTrackEffectsResponse, RunTrackResponse, RunsClient, RunsMeResponse,
} from '../../api/runs/api.generated';
import { toAppError } from '../../core/errors/app-error';
import {
  RunComparison, RunCurrentTrack, RunDifficulty, RunFinish, RunLink, RunNeutralized, RunPassedRound, RunPlay, RunRecord, RunRound, RunRoundScore,
  RunRoundSummary, RunSession, RunStatus, RunTrack, RunsMe,
} from '../domain/run';
import { RunCardKey, RunTrackEffects, isRunCard } from '../domain/run-cards';

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

  /** « Changer de morceau » : l'Échange offert de la manche ; rend la partie et le morceau de réserve, à la même place. */
  async swap(sessionId: number, position: number): Promise<RunPlay> {
    return toPlay(await firstValueFrom(this.client.swapRunTrack(sessionId, { position })));
  }

  /** Choisit le thème de la manche à thème (le créateur seulement) : `themeId` vide pour « Thème mystère », que le serveur tire. */
  async chooseTheme(sessionId: number, round: number, themeId: number | null): Promise<RunPlay> {
    return toPlay(await firstValueFrom(this.client.chooseRunTheme(sessionId, { round, themeId: themeId ?? undefined })));
  }

  /** Choisit la difficulté de la manche en cours ; la réponse porte son premier morceau (son extrait ne part qu'avec le choix). */
  async chooseDifficulty(sessionId: number, round: number, difficulty: RunDifficulty): Promise<RunPlay> {
    return toPlay(await firstValueFrom(this.client.chooseRunDifficulty(sessionId, { round, difficulty })));
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
  return status === 'won' || status === 'lost' || status === 'abandoned' ? status : 'pending';
}

function toLink(link: RunChallengeResponse): RunLink {
  return {
    code: link.code,
    authorPseudo: link.authorPseudo ?? null,
    trackCount: link.trackCount,
    rounds: link.rounds,
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
      disc: { key: row.disc.key, stars: row.disc.stars },
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
    shelf: (me.shelf ?? []).map(entry => ({ disc: { key: entry.disc.key, stars: entry.disc.stars }, count: entry.count })),
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
  return { round: round.round, score: round.score, objective: round.objective, disc: { key: round.disc.key, stars: round.disc.stars } };
}

function toRound(round: RunRoundResponse | undefined): RunRound | null {
  return round ? { round: round.round, score: round.score, objective: round.objective, maxScore: round.maxScore } : null;
}

function toRoundScore(round: RunRoundScoreResponse): RunRoundScore {
  return {
    round: round.round, score: round.score ?? null, objective: round.objective ?? null, passed: round.passed,
    difficulty: round.difficulty ? toDifficulty(round.difficulty) : null,
  };
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
    shortfall: finish.shortfall
      ? { points: finish.shortfall.points, disc: { key: finish.shortfall.disc.key, stars: finish.shortfall.disc.stars } }
      : null,
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
    answerSeconds: session.answerSeconds ?? 0,
    clockRemainingSeconds: session.clockRemainingSeconds ?? null,
    playedTracks: (session.playedTracks ?? []).map(toTrack),
    passedRounds: (session.passedRounds ?? []).map(toPassedRound),
    difficultyChoice: session.difficultyChoice
      ? {
          round: session.difficultyChoice.round,
          options: session.difficultyChoice.options.map(option => ({
            difficulty: toDifficulty(option.difficulty),
            objective: option.objective,
            maxScore: option.maxScore,
            listenSeconds: option.listenSeconds,
          })),
        }
      : null,
    themeChoice: session.themeChoice
      ? {
          round: session.themeChoice.round,
          themes: session.themeChoice.themes.map(t => ({ id: t.id, name: t.name, round: t.round, icon: t.icon ?? null })),
        }
      : null,
    hand: (session.hand ?? []).filter(c => isRunCard(c.card)).map(c => ({ slot: c.slot, card: c.card as RunCardKey })),
    swapAvailable: session.swapAvailable ?? false,
    ghost: session.ghost
      ? { pseudo: session.ghost.pseudo ?? null, total: session.ghost.total, stoppedAtRound: session.ghost.stoppedAtRound ?? null }
      : null,
    cardValues: session.cardValues
      ? { extendBonusSeconds: session.cardValues.extendBonusSeconds, rewardMarginPercent: session.cardValues.rewardMarginPercent }
      : null,
    nextDisc: session.nextDisc ? { key: session.nextDisc.key, stars: session.nextDisc.stars } : null,
    themes: (session.themes ?? []).map(t => ({ round: t.round, name: t.name })),
  };
}

function toEffects(effects: RunTrackEffectsResponse | undefined): RunTrackEffects | null {
  if (!effects) return null;
  return {
    cards: effects.cards.filter(isRunCard),
    year: effects.year ?? null,
    artistInitials: effects.artistInitials ?? null,
    titleInitials: effects.titleInitials ?? null,
    choices: effects.choices?.map(c => ({ artist: c.artist, title: c.title })) ?? null,
    genre: effects.genre ?? null,
  };
}

function toDifficulty(difficulty: string): RunDifficulty {
  return difficulty === 'easy' || difficulty === 'risky' ? difficulty : 'safe';
}

function toCurrent(current: RunCurrentTrackResponse | undefined): RunCurrentTrack | null {
  return current
    ? {
        position: current.position, round: current.round, positionInRound: current.positionInRound, previewUrl: current.previewUrl || null,
        listenSeconds: current.listenSeconds, waveform: current.waveform ?? null, effects: toEffects(current.effects),
      }
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

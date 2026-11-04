import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminChallengePlayer, AdminChallengeStats, AdminChallengeTrackStats, DailyClient, DurationBucket,
} from '../../api/daily/api.generated';
import {
  ChallengePlayer, ChallengeStats, ChallengeStatsPage, ChallengeTrackStats, GuessTimeBucket,
} from '../domain/challenge';

/**
 * Adaptateur des routes admin « défis » du module Daily : seule porte d'entrée vers le client généré.
 * Il rend des types du domaine (jours en texte `aaaa-mm-jj`, valeurs absentes en `null`) ; les erreurs
 * sont celles du client (`toAppError` sait les lire).
 */
@Injectable()
export class ChallengesApi {
  private readonly client = inject(DailyClient);

  /** Les stats des défis d'un mois (`aaaa-mm`), sinon des 30 derniers, avec tous les mois qui ont un défi et le nombre de défis. */
  async loadStats(month?: string): Promise<ChallengeStatsPage> {
    const response = await firstValueFrom(this.client.getChallengeStats(month));
    return { challenges: response.challenges.map(toChallengeStats), months: response.months, totalCount: response.totalCount };
  }

  /** Recalcule les stats d'un jour fini et rend le défi recalculé. */
  async recompute(day: string): Promise<ChallengeStats> {
    return toChallengeStats(await firstValueFrom(this.client.recomputeDayStats(day)));
  }
}

function toChallengeStats(challenge: AdminChallengeStats): ChallengeStats {
  return {
    id: challenge.id,
    date: toDay(challenge.date),
    playerCount: challenge.playerCount,
    pendingCount: challenge.pendingCount,
    abandonedCount: challenge.abandonedCount,
    expiredCount: challenge.expiredCount,
    scoreMin: challenge.scoreMin ?? null,
    scoreMax: challenge.scoreMax ?? null,
    scoreAvg: challenge.scoreAvg ?? null,
    scoreMedian: challenge.scoreMedian ?? null,
    maxPossibleScore: challenge.maxPossibleScore,
    scoreDistribution: (challenge.scoreDistribution ?? []).map(b => ({ minScore: b.minScore, maxScore: b.maxScore, count: b.count })),
    tracks: challenge.tracks.map(toTrackStats),
    players: challenge.players.map(toPlayer),
    computedAt: toInstant(challenge.computedAt),
    canRecompute: challenge.canRecompute,
  };
}

function toTrackStats(track: AdminChallengeTrackStats): ChallengeTrackStats {
  return {
    position: track.position,
    artist: track.artist,
    title: track.title,
    totalAnswers: track.totalAnswers,
    artistCorrectRate: track.artistCorrectRate,
    titleCorrectRate: track.titleCorrectRate,
    extendedRate: track.extendedRate,
    avgListenedSeconds: track.avgListenedSeconds ?? null,
    guessTimeDistribution: track.guessTimeDistribution.map(toBucket),
    notFoundCount: track.notFoundCount,
  };
}

function toBucket(bucket: DurationBucket): GuessTimeBucket {
  return { seconds: bucket.seconds, count: bucket.count };
}

function toPlayer(player: AdminChallengePlayer): ChallengePlayer {
  return { playerId: player.playerId, status: player.status, score: player.score, pseudo: player.pseudo ?? null };
}

/** Le client annonce un `Date`, le JSON livre un jour en texte (`2026-10-05`) : on garde le jour, sans fuseau. */
function toDay(value: Date | string): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

function toInstant(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

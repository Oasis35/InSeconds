import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminChallenge, AdminChallengePlayer, AdminChallengeStats, AdminChallengeTrackStats, DailyClient, DurationBucket,
} from '../../api/daily/api.generated';
import {
  ChallengeHistoryEntry, ChallengePlayer, ChallengeStats, ChallengeTrackStats, GuessTimeBucket,
} from '../domain/challenge';

/**
 * Adaptateur des routes admin « défis » du module Daily : seule porte d'entrée vers le client généré.
 * Il rend des types du domaine (jours en texte `aaaa-mm-jj`, valeurs absentes en `null`) ; les erreurs
 * sont celles du client (`toAppError` sait les lire).
 */
@Injectable({ providedIn: 'root' })
export class ChallengesApi {
  private readonly client = inject(DailyClient);

  /** Les stats des 30 derniers défis. */
  async loadStats(): Promise<ChallengeStats[]> {
    return (await firstValueFrom(this.client.getChallengeStats())).challenges.map(toChallengeStats);
  }

  /** L'historique : tous les défis, avec leurs morceaux. */
  async listHistory(): Promise<ChallengeHistoryEntry[]> {
    return (await firstValueFrom(this.client.listChallenges())).map(toHistoryEntry);
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

function toHistoryEntry(challenge: AdminChallenge): ChallengeHistoryEntry {
  return {
    id: challenge.id,
    date: toDay(challenge.date),
    tracks: challenge.tracks.map(track => ({
      position: track.position,
      artist: track.artist,
      title: track.title,
      deezerTrackId: track.deezerTrackId,
    })),
  };
}

/** Le client annonce un `Date`, le JSON livre un jour en texte (`2026-10-05`) : on garde le jour, sans fuseau. */
function toDay(value: Date | string): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

function toInstant(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

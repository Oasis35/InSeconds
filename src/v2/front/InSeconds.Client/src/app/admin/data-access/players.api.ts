import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminPlayer, AdminPlayerGame, DailyClient } from '../../api/daily/api.generated';
import { PlayerGame, RegisteredPlayer, toGameStatus } from '../domain/registered-player';

/**
 * Adaptateur de l'onglet Joueurs : seule porte vers le client généré du jeu du jour pour les routes
 * admin des comptes. Rend des types du domaine ; les erreurs sont celles du client (`toAppError`).
 */
@Injectable({ providedIn: 'root' })
export class AdminPlayersApi {
  private readonly client = inject(DailyClient);

  /** Les comptes inscrits, les plus récemment vus d'abord (l'ordre vient de l'API). */
  async list(): Promise<RegisteredPlayer[]> {
    return (await firstValueFrom(this.client.listRegisteredPlayers())).players.map(toPlayer);
  }

  /** Les parties des 30 derniers jours ; 404 `common.not_found` si le joueur n'existe plus. */
  async history(playerId: string): Promise<PlayerGame[]> {
    return (await firstValueFrom(this.client.getPlayerHistory(playerId))).games.map(toGame);
  }
}

function toPlayer(p: AdminPlayer): RegisteredPlayer {
  return {
    id: p.id,
    pseudo: p.pseudo ?? null,
    email: p.email ?? null,
    createdAt: toInstant(p.createdAt) ?? '',
    lastSeenAt: toInstant(p.lastSeenAt),
    gamesPlayed: p.gamesPlayed,
    isAdmin: p.isAdmin,
    currentStreak: p.currentStreak,
    streakFreezes: p.streakFreezes,
    streakProtected: p.streakProtected,
  };
}

function toGame(g: AdminPlayerGame): PlayerGame {
  return {
    date: toDay(g.date),
    status: toGameStatus(g.status),
    score: g.score ?? null,
    freezesUsed: g.freezesUsed,
    freezeEarned: g.freezeEarned,
  };
}

/** Le client annonce un `Date`, le JSON livre un texte ISO avec fuseau : on le garde tel quel. */
function toInstant(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

/** Un jour du défi (`2026-09-24`), sans fuseau. */
function toDay(value: Date | string): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

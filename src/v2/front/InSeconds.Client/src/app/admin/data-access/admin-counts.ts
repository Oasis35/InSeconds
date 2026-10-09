import { Injectable, signal } from '@angular/core';

/**
 * Les effectifs que la barre des onglets de l'admin affiche (« Pool (55) », « Défis (30) », « Joueurs (12) »).
 * Chaque onglet les renseigne quand il a chargé ses données : **avant sa première ouverture le libellé
 * reste nu** (comme en v1, où rien n'est chargé tant que l'onglet n'est pas ouvert). Les pages sont
 * détruites quand on change d'onglet, la coquille reste : d'où un service de la racine.
 */
@Injectable({ providedIn: 'root' })
export class AdminCounts {
  private readonly _pool = signal<number | null>(null);
  private readonly _challenges = signal<number | null>(null);
  private readonly _players = signal<number | null>(null);

  readonly pool = this._pool.asReadonly();
  readonly challenges = this._challenges.asReadonly();
  readonly players = this._players.asReadonly();

  setPool(count: number): void {
    this._pool.set(count);
  }

  setChallenges(count: number): void {
    this._challenges.set(count);
  }

  setPlayers(count: number): void {
    this._players.set(count);
  }
}

import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { SessionStore } from '../../core/session/session.store';

/**
 * Les effectifs que la barre des onglets de l'admin affiche (« Défis (30) », « Joueurs (12) »).
 * Chaque onglet les renseigne quand il a chargé ses données : **avant sa première ouverture le libellé
 * reste nu** (rien n'est chargé tant que l'onglet n'est pas ouvert). Les pages sont
 * détruites quand on change d'onglet, la coquille reste : d'où un service de la racine. Les effectifs
 * appartiennent au compte connecté : ils sont oubliés dès que le joueur de la session change
 * (déconnexion, autre compte).
 */
@Injectable({ providedIn: 'root' })
export class AdminCounts {
  private readonly session = inject(SessionStore);
  private readonly _challenges = signal<number | null>(null);
  private readonly _players = signal<number | null>(null);
  private readonly _candidates = signal<number | null>(null);
  /** Le joueur pour qui les effectifs ont été lus. */
  private owner = this.session.player()?.id ?? null;

  readonly challenges = this._challenges.asReadonly();
  readonly players = this._players.asReadonly();
  /** Les morceaux du sas « À valider » encore à traiter (ni écartés, ni ajoutés). */
  readonly candidates = this._candidates.asReadonly();

  constructor() {
    effect(() => {
      const id = this.session.player()?.id ?? null;
      untracked(() => {
        if (id === this.owner) return;
        this.owner = id;
        this.reset();
      });
    });
  }

  setChallenges(count: number): void {
    this._challenges.set(count);
  }

  setPlayers(count: number): void {
    this._players.set(count);
  }

  setCandidates(count: number): void {
    this._candidates.set(count);
  }

  private reset(): void {
    this._challenges.set(null);
    this._players.set(null);
    this._candidates.set(null);
  }
}

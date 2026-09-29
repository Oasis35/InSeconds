import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, map, catchError, of, switchMap } from 'rxjs';
import { ApiClient, StreakDto } from '../../api/api.generated';

// État de session du joueur courant (guest ou compte lié). Remplace l'ancien
// player-identity.service.ts : en plus de playerId (ID navigateur, usage admin),
// expose désormais isGuest/email/pseudo pour piloter l'UI login (footer, écrans /login).
// isAdmin reflète Player.IsAdmin (back) — pilote l'affichage de l'icône admin du footer
// et l'écran /admin (cf. game-footer, admin/CLAUDE.md).
@Injectable({ providedIn: 'root' })
export class PlayerSessionService {
  private readonly api = inject(ApiClient);

  private readonly _playerId = signal<string | null>(null);
  readonly playerId = this._playerId.asReadonly();
  private readonly _isGuest = signal(true);
  readonly isGuest = this._isGuest.asReadonly();
  private readonly _email = signal<string | null>(null);
  readonly email = this._email.asReadonly();
  private readonly _pseudo = signal<string | null>(null);
  readonly pseudo = this._pseudo.asReadonly();
  private readonly _currentStreak = signal(0);
  readonly currentStreak = this._currentStreak.asReadonly();
  /** Détail série + gels (rangée « Gels » du profil). */
  private readonly _streak = signal<StreakDto | null>(null);
  readonly streak = this._streak.asReadonly();
  private readonly _gamesPlayed = signal(0);
  readonly gamesPlayed = this._gamesPlayed.asReadonly();
  private readonly _isAdmin = signal(false);
  readonly isAdmin = this._isAdmin.asReadonly();

  readonly isLinked = computed(() => !this.isGuest());

  load(): Observable<void> {
    // peek=true : ne crée jamais de Player/cookie pour un simple chargement de page
    // (cf. Features/Players/GetCurrentPlayer/Endpoint.cs) — sinon tout visiteur guest
    // se verrait poser un cookie authToken avant même de cliquer "Commencer à jouer".
    return this.api.apiPlayersMe(true).pipe(
      tap(res => {
        this._playerId.set(res.playerId === '00000000-0000-0000-0000-000000000000' ? null : res.playerId);
        this._isGuest.set(res.isGuest);
        this._email.set(res.email ?? null);
        this._pseudo.set(res.pseudo ?? null);
        this._currentStreak.set(res.currentStreak);
        this._streak.set(res.streak ?? null);
        this._gamesPlayed.set(res.gamesPlayed);
        this._isAdmin.set(res.isAdmin);
      }),
      map(() => void 0),
      // L'app doit démarrer même si /api/players/me échoue : reste en état guest par défaut.
      catchError(err => {
        console.warn('Session joueur indisponible au démarrage.', err);
        return of(void 0);
      })
    );
  }

  logout(): Observable<void> {
    return this.api.apiAuthLogout().pipe(map(() => void 0));
  }

  /** Change le pseudo du joueur connecté (écran Profil). Met à jour le signal local en cas de succès. */
  updatePseudo(pseudo: string): Observable<string> {
    return this.api.apiPlayersMePseudo({ pseudo }).pipe(
      tap(res => this._pseudo.set(res.pseudo)),
      map(res => res.pseudo)
    );
  }

  /**
   * Demande le changement d'email du joueur connecté (écran Profil) : envoie un email de
   * confirmation à la nouvelle adresse. Ne modifie pas le signal `email` local — le
   * changement ne prend effet qu'après confirmation du lien (cf. confirmEmailChange).
   */
  requestEmailChange(newEmail: string): Observable<void> {
    return this.api.apiPlayersMeEmail({ newEmail }).pipe(map(() => void 0));
  }

  /** Confirme un changement d'email via le token reçu par email, puis rafraîchit la session. */
  confirmEmailChange(token: string): Observable<string> {
    return this.api.apiAuthEmailChangeConfirm({ token }).pipe(
      switchMap(res => this.load().pipe(map(() => res.email)))
    );
  }

  /**
   * Garantit un Player créé (usage admin uniquement, BrowserIdComponent) : contrairement à
   * load() (peek, jamais d'écriture), crée un guest à la demande si aucun cookie valide
   * n'existe déjà — pour que l'admin affiche toujours un ID navigateur, même s'il ne joue
   * jamais. No-op si un Player est déjà résolu (évite un appel réseau superflu).
   */
  ensureCreated(): void {
    if (this.playerId()) return;
    this.api.apiPlayersMe(false).pipe(
      tap(res => {
        this._playerId.set(res.playerId);
        this._isGuest.set(res.isGuest);
        this._email.set(res.email ?? null);
        this._pseudo.set(res.pseudo ?? null);
      }),
      catchError(() => of(void 0))
    ).subscribe();
  }
}

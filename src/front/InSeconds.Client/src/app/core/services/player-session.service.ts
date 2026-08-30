import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../api/api.generated';

// État de session du joueur courant (guest ou compte lié). Remplace l'ancien
// player-identity.service.ts : en plus de playerId (ID navigateur, usage admin),
// expose désormais isGuest/email/pseudo pour piloter l'UI login (footer, écrans /login).
@Injectable({ providedIn: 'root' })
export class PlayerSessionService {
  private readonly api = inject(ApiClient);

  readonly playerId = signal<string | null>(null);
  readonly isGuest = signal(true);
  readonly email = signal<string | null>(null);
  readonly pseudo = signal<string | null>(null);

  readonly isLinked = computed(() => !this.isGuest());

  load(): Observable<void> {
    // peek=true : ne crée jamais de Player/cookie pour un simple chargement de page
    // (cf. Features/Players/GetCurrentPlayer/Endpoint.cs) — sinon tout visiteur guest
    // se verrait poser un cookie authToken avant même de cliquer "Commencer à jouer".
    return this.api.apiPlayersMe(true).pipe(
      tap(res => {
        this.playerId.set(res.playerId === '00000000-0000-0000-0000-000000000000' ? null : res.playerId);
        this.isGuest.set(res.isGuest);
        this.email.set(res.email ?? null);
        this.pseudo.set(res.pseudo ?? null);
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
        this.playerId.set(res.playerId);
        this.isGuest.set(res.isGuest);
        this.email.set(res.email ?? null);
        this.pseudo.set(res.pseudo ?? null);
      }),
      catchError(() => of(void 0))
    ).subscribe();
  }
}

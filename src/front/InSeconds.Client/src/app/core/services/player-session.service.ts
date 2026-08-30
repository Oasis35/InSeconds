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
    return this.api.apiPlayersMe().pipe(
      tap(res => {
        this.playerId.set(res.playerId);
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
}

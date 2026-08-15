import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface CurrentPlayerResponse {
  playerId: string;
}

// Identifiant du joueur associé au cookie du navigateur courant (créé par le
// PlayerAuthMiddleware back dès le premier appel API, y compris sur la page admin).
// Sert à se reconnaître soi-même dans les listes de joueurs de l'admin.
@Injectable({ providedIn: 'root' })
export class PlayerIdentityService {
  private readonly http = inject(HttpClient);

  readonly playerId = signal<string | null>(null);

  constructor() {
    this.http.get<CurrentPlayerResponse>(`${environment.apiUrl}/api/players/me`).subscribe({
      next: res => this.playerId.set(res.playerId),
      error: () => {},
    });
  }
}

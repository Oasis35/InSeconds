import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { catchError, of, switchMap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { environment } from '../environments/environment';
import { ServiceDownComponent } from './features/service-down/service-down.component';

type HealthState = 'loading' | 'ok' | 'ko';

interface HealthResponse {
  status: string;
  utc: string;
}

// Intervalle de sonde /health. Court pour que l'overlay disparaisse vite après un
// redéploiement, sans marteler le backend.
const HEALTH_POLL_MS = 5000;

// Nombre d'échecs consécutifs avant de déclarer le backend KO. Évite qu'un simple
// hoquet réseau transitoire ne masque toute l'app avec l'overlay bloquant.
const HEALTH_KO_THRESHOLD = 3;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ServiceDownComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly health = signal<HealthState>('loading');
  protected readonly healthUtc = signal<string | null>(null);

  // Compteur d'échecs consécutifs de /health (réinitialisé à chaque succès).
  private consecutiveFailures = 0;

  // L'overlay « Service indisponible » ne s'affiche qu'à l'état confirmé 'ko' —
  // jamais pendant le 'loading' initial, pour éviter un faux positif au démarrage.
  protected readonly isServiceDown = computed(() => this.health() === 'ko');

  protected readonly healthLabel = computed(() => {
    switch (this.health()) {
      case 'loading': return 'Connexion au backend…';
      case 'ok': return `Backend OK · ${this.healthUtc()}`;
      case 'ko': return 'Backend KO (vérifie le conteneur API)';
    }
  });

  constructor() {
    timer(0, HEALTH_POLL_MS)
      .pipe(
        switchMap(() =>
          this.http
            .get<HealthResponse>(`${environment.apiUrl}/health`)
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((response) => {
        if (response) {
          this.consecutiveFailures = 0;
          this.health.set('ok');
          this.healthUtc.set(response.utc);
        } else {
          this.consecutiveFailures++;
          // Ne bascule en 'ko' (overlay) qu'après plusieurs échecs d'affilée.
          if (this.consecutiveFailures >= HEALTH_KO_THRESHOLD) {
            this.health.set('ko');
          }
        }
      });
  }
}

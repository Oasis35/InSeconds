import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { catchError, of } from 'rxjs';

import { environment } from '../environments/environment';

type HealthState = 'loading' | 'ok' | 'ko';

interface HealthResponse {
  status: string;
  utc: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly health = signal<HealthState>('loading');
  protected readonly healthUtc = signal<string | null>(null);

  protected readonly healthLabel = computed(() => {
    switch (this.health()) {
      case 'loading': return 'Connexion au backend…';
      case 'ok': return `Backend OK · ${this.healthUtc()}`;
      case 'ko': return 'Backend KO (vérifie le conteneur API)';
    }
  });

  constructor() {
    this.http
      .get<HealthResponse>(`${environment.apiUrl}/health`)
      .pipe(catchError(() => of(null)))
      .subscribe((response) => {
        if (response) {
          this.health.set('ok');
          this.healthUtc.set(response.utc);
        } else {
          this.health.set('ko');
        }
      });
  }
}

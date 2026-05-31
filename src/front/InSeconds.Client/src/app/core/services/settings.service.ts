import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';

interface AppSettingsResponse {
  allowedDurationsSeconds: number[];
  guessTimerSeconds: number;
  maxExtensionsPerAnswer: number;
  tracksPerChallenge: number;
  durationScores: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  readonly allowedDurations = signal<number[]>([1, 2, 3, 5, 10, 15, 30]);
  readonly guessTimerSeconds = signal(20);
  readonly maxExtensions = signal(1);
  readonly tracksPerChallenge = signal(10);
  readonly durationScores = signal<Record<number, number>>({
    1: 1000, 2: 850, 3: 700, 5: 500, 10: 300, 15: 150, 30: 50,
  });

  load(): Observable<void> {
    return this.http
      .get<AppSettingsResponse>(`${environment.apiUrl}/api/settings`)
      .pipe(
        tap(s => {
          this.allowedDurations.set(s.allowedDurationsSeconds);
          this.guessTimerSeconds.set(s.guessTimerSeconds);
          this.maxExtensions.set(s.maxExtensionsPerAnswer);
          this.tracksPerChallenge.set(s.tracksPerChallenge);
          this.durationScores.set(
            Object.fromEntries(
              Object.entries(s.durationScores).map(([k, v]) => [Number(k), v])
            )
          );
        }),
        map(() => void 0)
      );
  }
}

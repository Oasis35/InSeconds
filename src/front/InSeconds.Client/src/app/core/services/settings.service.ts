import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

interface AppSettingsResponse {
  allowedDurationsSeconds: number[];
  guessTimerSeconds: number;
  tracksPerChallenge: number;
  durationScores: Record<string, number>;
  trackCooldownDays: number;
  hintUnlockDurationsSeconds: number[];
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  private readonly _allowedDurations = signal<number[]>([0.5, 1, 1.5, 2, 3, 5, 10]);
  readonly allowedDurations = this._allowedDurations.asReadonly();
  private readonly _guessTimerSeconds = signal(20);
  readonly guessTimerSeconds = this._guessTimerSeconds.asReadonly();
  private readonly _tracksPerChallenge = signal(5);
  readonly tracksPerChallenge = this._tracksPerChallenge.asReadonly();
  private readonly _durationScores = signal<Record<number, number>>({
    0.5: 1000, 1: 850, 1.5: 700, 2: 550, 3: 400, 5: 250, 10: 100,
  });
  readonly durationScores = this._durationScores.asReadonly();
  private readonly _trackCooldownDays = signal(30);
  readonly trackCooldownDays = this._trackCooldownDays.asReadonly();
  private readonly _hintUnlockDurations = signal<number[]>([5, 10]);
  readonly hintUnlockDurations = this._hintUnlockDurations.asReadonly();

  load(): Observable<void> {
    return this.http
      .get<AppSettingsResponse>(`${environment.apiUrl}/api/settings`)
      .pipe(
        tap(s => {
          this._allowedDurations.set(s.allowedDurationsSeconds);
          this._guessTimerSeconds.set(s.guessTimerSeconds);
          this._tracksPerChallenge.set(s.tracksPerChallenge);
          this._durationScores.set(
            Object.fromEntries(
              Object.entries(s.durationScores).map(([k, v]) => [Number(k), v])
            )
          );
          this._trackCooldownDays.set(s.trackCooldownDays);
          this._hintUnlockDurations.set(s.hintUnlockDurationsSeconds);
        }),
        map(() => void 0),
        // L'app doit démarrer même si /api/settings est indisponible :
        // les signals gardent leurs valeurs par défaut (mêmes défauts que le back).
        catchError(err => {
          console.warn('Settings indisponibles au démarrage, valeurs par défaut utilisées.', err);
          return of(void 0);
        })
      );
  }
}

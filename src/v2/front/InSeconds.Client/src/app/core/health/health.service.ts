import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

export type HealthState = 'loading' | 'ok' | 'ko';

/** Intervalle de sonde : court pour que l'overlay disparaisse vite après un redéploiement. */
export const HEALTH_POLL_MS = 5000;

/** Échecs consécutifs avant de déclarer l'API KO : un hoquet réseau ne masque pas l'app. */
export const HEALTH_KO_THRESHOLD = 3;

/**
 * Sonde `GET /health` en continu et pilote l'overlay « Service indisponible » (repris de la v1).
 * L'overlay ne s'affiche qu'à l'état confirmé `ko`, jamais pendant le `loading` initial, et
 * disparaît seul dès que l'API répond de nouveau.
 */
@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _state = signal<HealthState>('loading');
  readonly state = this._state.asReadonly();
  readonly isDown = computed(() => this._state() === 'ko');

  private consecutiveFailures = 0;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    timer(0, HEALTH_POLL_MS)
      .pipe(
        switchMap(() =>
          this.http.get(`${environment.apiUrl}/health`).pipe(
            map(() => true),
            catchError(() => of(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(ok => this.record(ok));
  }

  private record(ok: boolean): void {
    if (ok) {
      this.consecutiveFailures = 0;
      this._state.set('ok');
      return;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= HEALTH_KO_THRESHOLD) this._state.set('ko');
  }
}

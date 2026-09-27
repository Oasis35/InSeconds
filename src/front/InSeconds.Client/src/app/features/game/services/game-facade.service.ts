import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { GameService } from '../../../core/services/game.service';
import { StartSessionResponse, SubmitAnswerRequest, SubmitAnswerResponse, GetTodaySessionResponse, RequestHintResponse } from '../../../core/models/game.models';

/** Résultat de `peekSession()` : succès (réponse brute) ou échec réseau/serveur. */
export type PeekOutcome =
  | { kind: 'ok'; response: GetTodaySessionResponse }
  | { kind: 'error' };

/** Résultat de `loadSession()` : la réponse HTTP interprétée, sans logique de machine à états. */
export type LoadOutcome =
  | { kind: 'ok'; response: StartSessionResponse }
  | { kind: 'already_played'; abandoned: boolean }
  | { kind: 'no_challenge' }
  | { kind: 'error' };

@Injectable()
export class GameFacadeService {
  private readonly gameService = inject(GameService);

  peekToday(): Observable<GetTodaySessionResponse> {
    return this.gameService.peekToday();
  }

  startToday(): Observable<StartSessionResponse> {
    return this.gameService.startToday();
  }

  /** `GET /api/sessions/today` interprété : ne crée rien, ne fait jamais échouer l'Observable. */
  peekSession(): Observable<PeekOutcome> {
    return this.gameService.peekToday().pipe(
      map(response => ({ kind: 'ok', response }) as const),
      catchError(() => of({ kind: 'error' } as const)),
    );
  }

  /** `POST /api/sessions` interprété : 409/503 deviennent des issues typées, jamais une erreur RxJS. */
  loadSession(): Observable<LoadOutcome> {
    return this.gameService.startToday().pipe(
      map(response => ({ kind: 'ok', response }) as const),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 409) {
          return of({ kind: 'already_played', abandoned: err.error?.error === 'abandoned' } as const);
        }
        if (err.status === 503) return of({ kind: 'no_challenge' } as const);
        return of({ kind: 'error' } as const);
      }),
    );
  }

  submitAnswer(sessionId: number, body: SubmitAnswerRequest): Observable<SubmitAnswerResponse> {
    return this.gameService.submitAnswer(sessionId, body);
  }

  abandonSession(sessionId: number): Observable<void> {
    return this.gameService.abandonSession(sessionId);
  }

  updateListening(sessionId: number, trackId: number, listenedSeconds: number): Observable<void> {
    return this.gameService.updateListening(sessionId, trackId, listenedSeconds);
  }

  requestHint(sessionId: number, dailyChallengeTrackId: number, level: number): Observable<RequestHintResponse> {
    return this.gameService.requestHint(sessionId, dailyChallengeTrackId, level);
  }
}

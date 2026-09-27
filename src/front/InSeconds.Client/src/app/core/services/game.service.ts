import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { retry } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { StartSessionResponse, SubmitAnswerRequest, SubmitAnswerResponse, GetTodaySessionResponse, RequestHintResponse } from '../models/game.models';

/** Nombre de tentatives supplémentaires + délai avant d'abandonner l'envoi d'une réponse (cf. piège E5 CLAUDE.md). */
const SUBMIT_ANSWER_RETRY_COUNT = 2;
const SUBMIT_ANSWER_RETRY_DELAY_MS = 1000;

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/sessions`;

  /**
   * État du défi du jour SANS créer de session ni de cookie joueur.
   * Appelé au chargement de la page ; `startToday()` (POST) n'est déclenché
   * qu'au clic explicite « Commencer à jouer » / « Reprendre ».
   */
  peekToday(): Observable<GetTodaySessionResponse> {
    return this.http.get<GetTodaySessionResponse>(`${this.base}/today`);
  }

  startToday(): Observable<StartSessionResponse> {
    return this.http.post<StartSessionResponse>(this.base, {});
  }

  /**
   * Réessaie automatiquement jusqu'à 2 fois (délai 1s) sur une coupure réseau ou une erreur
   * serveur (5xx) avant de laisser l'erreur remonter — cf. piège E5 CLAUDE.md : sans ça, une
   * réponse jamais enregistrée empêchait la partie de se terminer côté serveur. Une erreur
   * applicative (4xx — ex: 409 session déjà complétée) ne se résoudra pas en réessayant : elle
   * remonte immédiatement, sans délai ni tentative supplémentaire.
   */
  submitAnswer(sessionId: number, body: SubmitAnswerRequest): Observable<SubmitAnswerResponse> {
    return this.http.post<SubmitAnswerResponse>(`${this.base}/${sessionId}/answers`, body)
      .pipe(retry({
        count: SUBMIT_ANSWER_RETRY_COUNT,
        delay: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500) {
            throw error;
          }
          return timer(SUBMIT_ANSWER_RETRY_DELAY_MS);
        },
      }));
  }

  abandonSession(sessionId: number): Observable<void> {
    return this.http.put<void>(`${this.base}/${sessionId}/abandon`, {});
  }

  updateListening(sessionId: number, trackId: number, listenedSeconds: number): Observable<void> {
    return this.http.patch<void>(`${this.base}/${sessionId}/listening`, { trackId, listenedSeconds });
  }

  requestHint(sessionId: number, dailyChallengeTrackId: number, level: number): Observable<RequestHintResponse> {
    return this.http.post<RequestHintResponse>(`${this.base}/${sessionId}/hint`, { dailyChallengeTrackId, level });
  }
}

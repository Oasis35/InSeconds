import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StartSessionResponse, SubmitAnswerRequest, SubmitAnswerResponse } from '../models/game.models';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/sessions`;

  startToday(): Observable<StartSessionResponse> {
    return this.http.post<StartSessionResponse>(this.base, {});
  }

  submitAnswer(sessionId: number, body: SubmitAnswerRequest): Observable<SubmitAnswerResponse> {
    return this.http.post<SubmitAnswerResponse>(`${this.base}/${sessionId}/answers`, body);
  }

  abandonSession(sessionId: number): Observable<void> {
    return this.http.put<void>(`${this.base}/${sessionId}/abandon`, {});
  }

  updateListening(sessionId: number, trackId: number, listenedSeconds: number): Observable<void> {
    return this.http.patch<void>(`${this.base}/${sessionId}/listening`, { trackId, listenedSeconds });
  }
}

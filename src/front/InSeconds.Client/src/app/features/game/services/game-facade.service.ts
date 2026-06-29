import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GameService } from '../../../core/services/game.service';
import { StartSessionResponse, SubmitAnswerRequest, SubmitAnswerResponse } from '../../../core/models/game.models';

@Injectable()
export class GameFacadeService {
  private readonly gameService = inject(GameService);

  startToday(): Observable<StartSessionResponse> {
    return this.gameService.startToday();
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
}

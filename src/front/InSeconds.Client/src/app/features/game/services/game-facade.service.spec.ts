import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { GameFacadeService } from './game-facade.service';
import { GameService } from '../../../core/services/game.service';
import { GetTodaySessionResponse, StartSessionResponse } from '../../../core/models/game.models';

describe('GameFacadeService', () => {
  let service: GameFacadeService;
  let peekTodaySpy: Mock;
  let startTodaySpy: Mock;

  beforeEach(() => {
    peekTodaySpy = vi.fn().mockName('peekToday');
    startTodaySpy = vi.fn().mockName('startToday');

    TestBed.configureTestingModule({
      providers: [
        GameFacadeService,
        { provide: GameService, useValue: { peekToday: peekTodaySpy, startToday: startTodaySpy } },
      ],
    });

    service = TestBed.inject(GameFacadeService);
  });

  describe('peekSession()', () => {
    it('wraps a successful response in { kind: "ok" }', async () => {
      const response = { state: 'can_start' } as GetTodaySessionResponse;
      peekTodaySpy.mockReturnValue(of(response));

      service.peekSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'ok', response });
        ;
      });
    });

    it('never lets an HTTP failure reach the subscriber as an error', async () => {
      peekTodaySpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      service.peekSession().subscribe({
        next: outcome => {
          expect(outcome).toEqual({ kind: 'error' });
          ;
        },
        error: () => expect.fail('peekSession() should never error out'),
      });
    });
  });

  describe('loadSession()', () => {
    it('wraps a successful response in { kind: "ok" }', async () => {
      const response = { sessionId: 1, isResuming: false } as StartSessionResponse;
      startTodaySpy.mockReturnValue(of(response));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'ok', response });
        ;
      });
    });

    it('maps a 409 "abandoned" error to { kind: "already_played", abandoned: true }', async () => {
      startTodaySpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: 'abandoned' } })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'already_played', abandoned: true });
        ;
      });
    });

    it('maps a plain 409 to { kind: "already_played", abandoned: false }', async () => {
      startTodaySpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: {} })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'already_played', abandoned: false });
        ;
      });
    });

    it('maps a 503 to { kind: "no_challenge" }', async () => {
      startTodaySpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'no_challenge' });
        ;
      });
    });

    it('maps any other error to { kind: "error" }', async () => {
      startTodaySpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'error' });
        ;
      });
    });
  });
});

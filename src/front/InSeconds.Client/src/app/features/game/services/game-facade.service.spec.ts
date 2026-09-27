import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { GameFacadeService } from './game-facade.service';
import { GameService } from '../../../core/services/game.service';
import { GetTodaySessionResponse, StartSessionResponse } from '../../../core/models/game.models';

describe('GameFacadeService', () => {
  let service: GameFacadeService;
  let peekTodaySpy: jasmine.Spy;
  let startTodaySpy: jasmine.Spy;

  beforeEach(() => {
    peekTodaySpy = jasmine.createSpy('peekToday');
    startTodaySpy = jasmine.createSpy('startToday');

    TestBed.configureTestingModule({
      providers: [
        GameFacadeService,
        { provide: GameService, useValue: { peekToday: peekTodaySpy, startToday: startTodaySpy } },
      ],
    });

    service = TestBed.inject(GameFacadeService);
  });

  describe('peekSession()', () => {
    it('wraps a successful response in { kind: "ok" }', (done) => {
      const response = { state: 'can_start' } as GetTodaySessionResponse;
      peekTodaySpy.and.returnValue(of(response));

      service.peekSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'ok', response });
        done();
      });
    });

    it('never lets an HTTP failure reach the subscriber as an error', (done) => {
      peekTodaySpy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      service.peekSession().subscribe({
        next: outcome => {
          expect(outcome).toEqual({ kind: 'error' });
          done();
        },
        error: () => fail('peekSession() should never error out'),
      });
    });
  });

  describe('loadSession()', () => {
    it('wraps a successful response in { kind: "ok" }', (done) => {
      const response = { sessionId: 1, isResuming: false } as StartSessionResponse;
      startTodaySpy.and.returnValue(of(response));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'ok', response });
        done();
      });
    });

    it('maps a 409 "abandoned" error to { kind: "already_played", abandoned: true }', (done) => {
      startTodaySpy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: 'abandoned' } })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'already_played', abandoned: true });
        done();
      });
    });

    it('maps a plain 409 to { kind: "already_played", abandoned: false }', (done) => {
      startTodaySpy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: {} })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'already_played', abandoned: false });
        done();
      });
    });

    it('maps a 503 to { kind: "no_challenge" }', (done) => {
      startTodaySpy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'no_challenge' });
        done();
      });
    });

    it('maps any other error to { kind: "error" }', (done) => {
      startTodaySpy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

      service.loadSession().subscribe(outcome => {
        expect(outcome).toEqual({ kind: 'error' });
        done();
      });
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { HintService } from './hint.service';
import { GameFacadeService } from './game-facade.service';
import { RequestHintResponse } from '../../../core/models/game.models';

describe('HintService', () => {
  let service: HintService;
  let requestHintSpy: jasmine.Spy;

  beforeEach(() => {
    requestHintSpy = jasmine.createSpy('requestHint');

    TestBed.configureTestingModule({
      providers: [
        HintService,
        { provide: GameFacadeService, useValue: { requestHint: requestHintSpy } },
      ],
    });

    service = TestBed.inject(HintService);
  });

  it('defaults to nothing revealed and no request pending', () => {
    expect(service.hint1Revealed()).toBeFalse();
    expect(service.hint2Revealed()).toBeFalse();
    expect(service.hintYear()).toBeNull();
    expect(service.hintArtistMasked()).toBeNull();
    expect(service.hintRequestPending()).toBeFalse();
  });

  it('useHint1 calls requestHint(sessionId, trackId, 1) and reveals the year', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: undefined } as RequestHintResponse));

    service.useHint1(42, 7);

    expect(requestHintSpy).toHaveBeenCalledWith(42, 7, 1);
    expect(service.hintYear()).toBe(2016);
    expect(service.hint1Revealed()).toBeTrue();
    expect(service.hintRequestPending()).toBeFalse();
  });

  it('useHint2 reveals year + masked artist, and also marks level 1 as revealed', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: 'D _ _ _   P _ _ _' } as RequestHintResponse));

    service.useHint2(42, 7);

    expect(requestHintSpy).toHaveBeenCalledWith(42, 7, 2);
    expect(service.hintYear()).toBe(2016);
    expect(service.hintArtistMasked()).toBe('D _ _ _   P _ _ _');
    expect(service.hint1Revealed()).toBeTrue();
    expect(service.hint2Revealed()).toBeTrue();
  });

  it('useHint1 does not re-call requestHint if already revealed', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: undefined } as RequestHintResponse));

    service.useHint1(42, 7);
    service.useHint1(42, 7);

    expect(requestHintSpy).toHaveBeenCalledTimes(1);
  });

  it('useHint1 is a no-op while a request is already pending', () => {
    requestHintSpy.and.returnValue(new Subject<RequestHintResponse>());

    service.useHint1(42, 7);
    service.useHint1(42, 7);

    expect(requestHintSpy).toHaveBeenCalledTimes(1);
    expect(service.hintRequestPending()).toBeTrue();
  });

  it('clears the pending flag without revealing anything on error', () => {
    requestHintSpy.and.returnValue(throwError(() => new Error('boom')));

    service.useHint1(42, 7);

    expect(service.hintRequestPending()).toBeFalse();
    expect(service.hint1Revealed()).toBeFalse();
  });

  it('reset() clears all signals', () => {
    requestHintSpy.and.returnValue(of({ year: 2016, artistMasked: 'x' } as RequestHintResponse));
    service.useHint2(42, 7);

    service.reset();

    expect(service.hint1Revealed()).toBeFalse();
    expect(service.hint2Revealed()).toBeFalse();
    expect(service.hintYear()).toBeNull();
    expect(service.hintArtistMasked()).toBeNull();
    expect(service.hintRequestPending()).toBeFalse();
  });
});

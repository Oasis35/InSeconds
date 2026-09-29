import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { HintService } from './hint.service';
import { GameFacadeService } from './game-facade.service';
import { RequestHintResponse } from '../../../core/models/game.models';

describe('HintService', () => {
  let service: HintService;
  let requestHintSpy: Mock;

  beforeEach(() => {
    requestHintSpy = vi.fn().mockName('requestHint');

    TestBed.configureTestingModule({
      providers: [
        HintService,
        { provide: GameFacadeService, useValue: { requestHint: requestHintSpy } },
      ],
    });

    service = TestBed.inject(HintService);
  });

  it('defaults to nothing revealed and no request pending', () => {
    expect(service.hint1Revealed()).toBe(false);
    expect(service.hint2Revealed()).toBe(false);
    expect(service.hintYear()).toBeNull();
    expect(service.hintArtistMasked()).toBeNull();
    expect(service.hintRequestPending()).toBe(false);
  });

  it('useHint1 calls requestHint(sessionId, trackId, 1) and reveals the year', () => {
    requestHintSpy.mockReturnValue(of({ year: 2016, artistMasked: undefined } as RequestHintResponse));

    service.useHint1(42, 7);

    expect(requestHintSpy).toHaveBeenCalledWith(42, 7, 1);
    expect(service.hintYear()).toBe(2016);
    expect(service.hint1Revealed()).toBe(true);
    expect(service.hintRequestPending()).toBe(false);
  });

  it('useHint2 reveals year + masked artist, and also marks level 1 as revealed', () => {
    requestHintSpy.mockReturnValue(of({ year: 2016, artistMasked: 'D _ _ _   P _ _ _' } as RequestHintResponse));

    service.useHint2(42, 7);

    expect(requestHintSpy).toHaveBeenCalledWith(42, 7, 2);
    expect(service.hintYear()).toBe(2016);
    expect(service.hintArtistMasked()).toBe('D _ _ _   P _ _ _');
    expect(service.hint1Revealed()).toBe(true);
    expect(service.hint2Revealed()).toBe(true);
  });

  it('useHint1 does not re-call requestHint if already revealed', () => {
    requestHintSpy.mockReturnValue(of({ year: 2016, artistMasked: undefined } as RequestHintResponse));

    service.useHint1(42, 7);
    service.useHint1(42, 7);

    expect(requestHintSpy).toHaveBeenCalledTimes(1);
  });

  it('useHint1 is a no-op while a request is already pending', () => {
    requestHintSpy.mockReturnValue(new Subject<RequestHintResponse>());

    service.useHint1(42, 7);
    service.useHint1(42, 7);

    expect(requestHintSpy).toHaveBeenCalledTimes(1);
    expect(service.hintRequestPending()).toBe(true);
  });

  it('clears the pending flag without revealing anything on error', () => {
    requestHintSpy.mockReturnValue(throwError(() => new Error('boom')));

    service.useHint1(42, 7);

    expect(service.hintRequestPending()).toBe(false);
    expect(service.hint1Revealed()).toBe(false);
  });

  it('reset() clears all signals', () => {
    requestHintSpy.mockReturnValue(of({ year: 2016, artistMasked: 'x' } as RequestHintResponse));
    service.useHint2(42, 7);

    service.reset();

    expect(service.hint1Revealed()).toBe(false);
    expect(service.hint2Revealed()).toBe(false);
    expect(service.hintYear()).toBeNull();
    expect(service.hintArtistMasked()).toBeNull();
    expect(service.hintRequestPending()).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { GameShareService } from './game-share.service';
import { ClipboardService } from '../../../core/services/clipboard.service';
import { RoundResult } from '../screens/final-recap-screen/final-recap-screen.component';
import { TodayStatsResponse } from '../../../api/api.generated';

class TranslateServiceStub {
  instant(key: string): string {
    return key;
  }
}

function makeResult(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    artistCorrect: true,
    titleCorrect: true,
    score: 850,
    correctArtist: 'Artist',
    correctTitle: 'Title',
    listenedDurationSeconds: 1,
    averageSecondsWhenCorrect: 2,
    failureRatePercent: 10,
    position: 1,
    coverUrl: null,
    deezerTrackId: 1,
    ...overrides,
  };
}

describe('GameShareService', () => {
  let service: GameShareService;
  let clipboardStub: { copy: jasmine.Spy };

  beforeEach(() => {
    clipboardStub = { copy: jasmine.createSpy('copy').and.returnValue(Promise.resolve(true)) };

    TestBed.configureTestingModule({
      providers: [
        GameShareService,
        { provide: ClipboardService, useValue: clipboardStub },
        { provide: TranslateService, useClass: TranslateServiceStub },
      ],
    });

    service = TestBed.inject(GameShareService);
  });

  it('defaults copied/failed to false', () => {
    expect(service.copied()).toBeFalse();
    expect(service.failed()).toBeFalse();
  });

  it('shareResults() copies a text built from the round results and sets copied on success', async () => {
    service.shareResults([makeResult({ artistCorrect: true, titleCorrect: false, listenedDurationSeconds: 3 })], 850);
    await Promise.resolve();

    expect(clipboardStub.copy).toHaveBeenCalledTimes(1);
    const text = clipboardStub.copy.calls.mostRecent().args[0] as string;
    expect(text).toContain('✅/❌ 3s');
    expect(service.copied()).toBeTrue();
  });

  it('shareStats() skips tracks with no listened duration and copies the rest', async () => {
    const stats = {
      yourScore: 1200,
      tracks: [
        { artistCorrect: true, titleCorrect: true, listenedDurationSeconds: 2 },
        { artistCorrect: false, titleCorrect: false, listenedDurationSeconds: null },
      ],
    } as unknown as TodayStatsResponse;

    service.shareStats(stats);
    await Promise.resolve();

    const text = clipboardStub.copy.calls.mostRecent().args[0] as string;
    expect(text).toContain('✅/✅ 2s');
    expect(text.match(/\n/g)).toHaveSize(3); // title + 1 track line + score, pas de ligne pour le track sans durée
  });

  it('sets failed (not copied) when the clipboard copy fails', async () => {
    clipboardStub.copy.and.returnValue(Promise.resolve(false));

    service.shareResults([makeResult()], 850);
    await Promise.resolve();

    expect(service.copied()).toBeFalse();
    expect(service.failed()).toBeTrue();
  });
});

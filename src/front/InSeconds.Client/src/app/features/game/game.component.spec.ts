import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GameComponent } from './game.component';
import { GameFacadeService } from './services/game-facade.service';
import { ApiClient } from '../../api/api.generated';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { ClipboardService } from '../../core/services/clipboard.service';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { TranslateService } from '@ngx-translate/core';

class TranslateServiceStub {
  instant(key: string): string {
    return key;
  }
}

// Ces tests couvrent uniquement le toast de streak (guest, écrans done/already_played) :
// `streakToastDismissed` doit être remis à `false` à chaque (ré)entrée dans ces états,
// pour que le toast puisse réapparaître après un aller-retour dans une partie suivante.
// Le reste de la machine à états n'a pas de spec dédiée dans ce repo (couverture via les
// écrans de présentation + les tests E2E) — on ne l'étend pas ici.
describe('GameComponent — streak toast', () => {
  let component: GameComponent;
  let gameFacadeStub: {
    peekToday: jasmine.Spy;
    startToday: jasmine.Spy;
    submitAnswer: jasmine.Spy;
    abandonSession: jasmine.Spy;
    updateListening: jasmine.Spy;
  };
  let apiStub: { apiStatsToday: jasmine.Spy };

  beforeEach(() => {
    gameFacadeStub = {
      peekToday: jasmine.createSpy('peekToday'),
      startToday: jasmine.createSpy('startToday'),
      submitAnswer: jasmine.createSpy('submitAnswer'),
      abandonSession: jasmine.createSpy('abandonSession').and.returnValue(of(void 0)),
      updateListening: jasmine.createSpy('updateListening'),
    };
    apiStub = {
      apiStatsToday: jasmine.createSpy('apiStatsToday').and.returnValue(of({
        yourScore: 100, medianScore: 100, totalPlayers: 1, currentStreak: 3, tracks: [],
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: GameFacadeService, useValue: gameFacadeStub },
        { provide: ApiClient, useValue: apiStub },
        { provide: AudioPlayerService, useValue: { preloadAll: () => Promise.resolve() } },
        { provide: ClipboardService, useValue: {} },
        { provide: PlayerSessionService, useValue: { isLinked: signal(false) } },
        { provide: TranslateService, useClass: TranslateServiceStub },
      ],
    });

    component = TestBed.runInInjectionContext(() => new GameComponent());
  });

  it('defaults to not dismissed', () => {
    expect(component['streakToastDismissed']()).toBeFalse();
  });

  it('resets on peekSession → already_played (via retry())', () => {
    component['streakToastDismissed'].set(true);
    gameFacadeStub.peekToday.and.returnValue(of({
      state: 'already_played', currentStreak: 3, tracksCount: 3, completedCount: 3,
    }));

    component['retry']();

    expect(component['gameState']()).toBe('already_played');
    expect(component['streakToastDismissed']()).toBeFalse();
  });

  it('resets on peekSession → abandoned (via retry())', () => {
    component['streakToastDismissed'].set(true);
    gameFacadeStub.peekToday.and.returnValue(of({
      state: 'abandoned', currentStreak: 3, tracksCount: 3, completedCount: 1,
    }));

    component['retry']();

    expect(component['gameState']()).toBe('already_played');
    expect(component['sessionAbandoned']()).toBeTrue();
    expect(component['streakToastDismissed']()).toBeFalse();
  });

  it('resets on confirmAbandon()', () => {
    component['streakToastDismissed'].set(true);
    component['sessionId'] = 1;

    component['confirmAbandon']();

    expect(component['gameState']()).toBe('already_played');
    expect(component['streakToastDismissed']()).toBeFalse();
  });

  it('resets on onNextTrack() reaching the last track (done)', () => {
    component['streakToastDismissed'].set(true);
    component['tracks'].set([{ id: 1, previewUrl: null, coverUrl: null, deezerTrackId: 1 } as any]);
    component['currentIndex'].set(0);

    component['onNextTrack']();

    expect(component['gameState']()).toBe('done');
    expect(component['streakToastDismissed']()).toBeFalse();
  });

  it('resets on the 409 branch of loadSession() (via beginGame())', () => {
    component['streakToastDismissed'].set(true);
    gameFacadeStub.startToday.and.returnValue(throwError(() => ({ status: 409, error: { error: 'already_played' } })));

    component['beginGame']();

    expect(component['gameState']()).toBe('already_played');
    expect(component['streakToastDismissed']()).toBeFalse();
  });
});

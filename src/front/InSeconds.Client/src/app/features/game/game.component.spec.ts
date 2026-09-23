import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GameComponent } from './game.component';
import { GameFacadeService } from './services/game-facade.service';
import { GameShareService } from './services/game-share.service';
import { LeaveConfirmationService } from './services/leave-confirmation.service';
import { ApiClient } from '../../api/api.generated';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { ClipboardService } from '../../core/services/clipboard.service';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';

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
  let isLinked: ReturnType<typeof signal<boolean>>;
  let router: { navigate: jasmine.Spy };

  beforeEach(() => {
    gameFacadeStub = {
      peekToday: jasmine.createSpy('peekToday').and.returnValue(of({
        state: 'can_start', currentStreak: 0, tracksCount: 3, completedCount: 0,
      })),
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

    isLinked = signal(false);
    router = { navigate: jasmine.createSpy('navigate') };

    TestBed.configureTestingModule({
      providers: [
        { provide: GameFacadeService, useValue: gameFacadeStub },
        { provide: ApiClient, useValue: apiStub },
        { provide: AudioPlayerService, useValue: { preloadAll: () => Promise.resolve() } },
        { provide: ClipboardService, useValue: {} },
        { provide: PlayerSessionService, useValue: { isLinked } },
        { provide: Router, useValue: router },
        { provide: TranslateService, useClass: TranslateServiceStub },
        GameShareService,
        LeaveConfirmationService,
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

describe('GameComponent — gel de série', () => {
  let component: GameComponent;
  let gameFacadeStub: { peekToday: jasmine.Spy; startToday: jasmine.Spy };
  let apiStub: { apiStatsToday: jasmine.Spy };
  let isLinked: ReturnType<typeof signal<boolean>>;
  let router: { navigate: jasmine.Spy };

  const streak = (overrides: Record<string, unknown> = {}) => ({
    status: 'active', streak: 12, freezes: 2, maxFreezes: 2, freezeEveryDays: 7,
    nextFreezeInDays: 2, missedDays: 0, lostStreak: undefined, lastPlayedDate: '2026-09-22',
    ...overrides,
  });

  const stats = (overrides: Record<string, unknown> = {}) => ({
    yourScore: 100, medianScore: 100, totalPlayers: 1, currentStreak: 13, tracks: [],
    freezesUsed: 0, freezeMilestone: false, ...overrides,
  });

  beforeEach(() => {
    localStorage.removeItem('inseconds.lostStreakNudgeSeen');
    isLinked = signal(true);
    router = { navigate: jasmine.createSpy('navigate') };
    gameFacadeStub = {
      peekToday: jasmine.createSpy('peekToday').and.returnValue(of({
        state: 'can_start', currentStreak: 12, tracksCount: 3, completedCount: 0, streak: streak(),
      })),
      startToday: jasmine.createSpy('startToday').and.returnValue(of({
        sessionId: 1, tracks: [], currentStreak: 12, isResuming: false, resumeFromPosition: 0, completedAnswers: [],
      })),
    };
    apiStub = { apiStatsToday: jasmine.createSpy('apiStatsToday').and.returnValue(of(stats())) };

    TestBed.configureTestingModule({
      providers: [
        { provide: GameFacadeService, useValue: gameFacadeStub },
        { provide: ApiClient, useValue: apiStub },
        { provide: AudioPlayerService, useValue: { preloadAll: () => Promise.resolve() } },
        { provide: ClipboardService, useValue: {} },
        { provide: PlayerSessionService, useValue: { isLinked } },
        { provide: Router, useValue: router },
        { provide: TranslateService, useClass: TranslateServiceStub },
        GameShareService,
        LeaveConfirmationService,
      ],
    });

    component = TestBed.runInInjectionContext(() => new GameComponent());
  });

  afterEach(() => localStorage.removeItem('inseconds.lostStreakNudgeSeen'));

  function finishGame(todayStats: ReturnType<typeof stats>): void {
    apiStub.apiStatsToday.and.returnValue(of(todayStats));
    component['tracks'].set([{ id: 1, previewUrl: null, coverUrl: null, deezerTrackId: 1 } as any]);
    component['currentIndex'].set(0);
    component['onNextTrack']();
  }

  it('stores the peek streak detail for the header pill', () => {
    component['retry']();
    expect(component['streakInfo']()?.freezes).toBe(2);
  });

  it('refreshes the streak detail after the last answer (freeze used or earned)', () => {
    gameFacadeStub.peekToday.and.returnValue(of({
      state: 'already_played', currentStreak: 13, tracksCount: 3, completedCount: 3, streak: streak({ streak: 13, freezes: 1 }),
    }));

    finishGame(stats({ freezesUsed: 1 }));

    expect(component['streakInfo']()?.freezes).toBe(1);
  });

  it('shows "1 gel a sauvé ta série" to a linked player after a game that used a freeze', () => {
    finishGame(stats({ freezesUsed: 1 }));

    expect(component['showGelUsedToast']()).toBeTrue();
    expect(component['showGelEarnedToast']()).toBeFalse();
    expect(component['freezesUsedKey']()).toBe('one');
  });

  it('shows "+1 gel gagné" (and not the used toast) when a freeze was earned', () => {
    finishGame(stats({ freezesUsed: 1, freezeMilestone: true }));

    expect(component['showGelEarnedToast']()).toBeTrue();
    expect(component['showGelUsedToast']()).toBeFalse();
  });

  it('hides the freeze toasts once dismissed', () => {
    finishGame(stats({ freezeMilestone: true }));

    component['gelToastDismissed'].set(true);

    expect(component['showGelEarnedToast']()).toBeFalse();
  });

  it('never shows freeze toasts to a guest, but switches the streak toast to "Tu aurais gagné un gel"', () => {
    isLinked.set(false);
    finishGame(stats({ currentStreak: 7, freezeMilestone: true }));

    expect(component['showGelEarnedToast']()).toBeFalse();
    expect(component['showStreakToast']()).toBeTrue();
    expect(component['guestFreezeMiss']()).toBeTrue();
  });

  it('shows the guest "série perdue" toast on welcome, once per lost streak', () => {
    isLinked.set(false);
    gameFacadeStub.peekToday.and.returnValue(of({
      state: 'can_start', currentStreak: 0, tracksCount: 3, completedCount: 0,
      streak: streak({ status: 'broken', streak: 0, freezes: 0, maxFreezes: 0, lostStreak: 6, lastPlayedDate: '2026-09-20' }),
    }));

    component['retry']();

    expect(component['showLostToast']()).toBeTrue();
    expect(component['lostStreak']()).toBe(6);
    expect(localStorage.getItem('inseconds.lostStreakNudgeSeen')).toBe('2026-09-20');

    // Second chargement de la page : déjà vu pour cette série perdue.
    component['lostStreak'].set(null);
    component['retry']();
    expect(component['showLostToast']()).toBeFalse();
  });

  it('"Jouer maintenant" in the protected sheet starts the game from welcome', () => {
    component['retry']();
    component['showStreakSheet'].set(true);

    component['playFromStreakSheet']();

    expect(component['showStreakSheet']()).toBeFalse();
    expect(gameFacadeStub.startToday).toHaveBeenCalled();
  });

  it('"Créer un compte" in the guest sheet navigates to /login', () => {
    component['showStreakSheet'].set(true);

    component['signupFromStreakSheet']();

    expect(component['showStreakSheet']()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});

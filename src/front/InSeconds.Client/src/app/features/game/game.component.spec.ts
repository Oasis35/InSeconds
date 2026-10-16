import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GameComponent } from './game.component';
import { GameStore, GameState } from './game.store';
import { GameShareService } from './services/game-share.service';
import { LeaveConfirmationService } from './services/leave-confirmation.service';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { ErrorReportingService } from '../../core/services/error-reporting.service';
import { AnsweredEvent } from './blind-round/blind-round.component';

// L'état et les transitions du jeu sont testés dans game.store.spec.ts ; ici, seulement ce que
// le composant garde : panneau de série, confirmation de sortie, lien avec le round affiché.
describe('GameComponent', () => {
  let component: GameComponent;
  let state: ReturnType<typeof signal<GameState>>;
  let store: { state: typeof state; init: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn>; playNow: ReturnType<typeof vi.fn>; submitAnswer: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  const event: AnsweredEvent = { trackId: 7, listenedDurationSeconds: 1, wasExtended: false, artistAnswer: 'a', titleAnswer: 't' };

  beforeEach(() => {
    state = signal<GameState>('welcome');
    store = { state, init: vi.fn(), refresh: vi.fn(), playNow: vi.fn(), submitAnswer: vi.fn() };
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: GameStore, useValue: store },
        { provide: GameShareService, useValue: { copied: signal(false), failed: signal(false) } },
        LeaveConfirmationService,
        { provide: PlayerSessionService, useValue: { isLinked: signal(false) } },
        { provide: ErrorReportingService, useValue: { lastErrorCode: signal(null) } },
        { provide: Router, useValue: router },
      ],
    });
    component = TestBed.runInInjectionContext(() => new GameComponent());
  });

  it('starts the store on init', () => {
    component.ngOnInit();
    expect(store.init).toHaveBeenCalled();
  });

  it('"Jouer maintenant" closes the streak sheet and asks the store to play', () => {
    component['openStreakSheet']();

    component['playFromStreakSheet']();

    expect(component['showStreakSheet']()).toBe(false);
    expect(store.playNow).toHaveBeenCalled();
  });

  it('"Créer un compte" closes the streak sheet and navigates to /login', () => {
    component['openStreakSheet']();

    component['signupFromStreakSheet']();

    expect(component['showStreakSheet']()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('lets navigation through when no game is being played', () => {
    expect(component.canDeactivate()).toBe(true);
  });

  it('asks for confirmation before leaving a game in progress', () => {
    state.set('playing');
    expect(component.canDeactivate()).toBeInstanceOf(Promise);
  });

  it('forwards a submitted answer to the store without throwing, success or failure', () => {
    store.submitAnswer.mockReturnValue(of({ score: 100 }));
    expect(() => component['onAnswered'](event)).not.toThrow();

    store.submitAnswer.mockReturnValue(throwError(() => new Error('network')));
    expect(() => component['onAnswered'](event)).not.toThrow();
    expect(store.submitAnswer).toHaveBeenCalledTimes(2);
  });
});

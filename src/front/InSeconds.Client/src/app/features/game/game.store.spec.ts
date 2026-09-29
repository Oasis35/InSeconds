import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GameStore } from './game.store';
import { GameFacadeService } from './services/game-facade.service';
import { ApiClient } from '../../api/api.generated';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { PlayerSessionService } from '../../core/services/player-session.service';

// Configuration commune aux suites : seuls les stubs changent d'une suite à l'autre.
function createStore(gameFacade: object, api: object, isLinked: ReturnType<typeof signal<boolean>>): GameStore {
  TestBed.configureTestingModule({
    providers: [
      GameStore,
      { provide: GameFacadeService, useValue: gameFacade },
      { provide: ApiClient, useValue: api },
      { provide: AudioPlayerService, useValue: { preloadAll: () => Promise.resolve() } },
      { provide: PlayerSessionService, useValue: { isLinked } },
    ],
  });

  return TestBed.inject(GameStore);
}

// Ces tests couvrent uniquement le toast de streak (guest, écrans done/already_played) :
// `streakToastDismissed` doit être remis à `false` à chaque (ré)entrée dans ces états,
// pour que le toast puisse réapparaître après un aller-retour dans une partie suivante.
// Le reste de la machine à états n'a pas de spec dédiée dans ce repo (couverture via les
// écrans de présentation + les tests E2E) — on ne l'étend pas ici.
describe('GameStore — streak toast', () => {
  let store: GameStore;
  let gameFacadeStub: {
    peekSession: Mock;
    loadSession: Mock;
    submitAnswer: Mock;
    abandonSession: Mock;
    updateListening: Mock;
  };
  let apiStub: {
    apiStatsToday: Mock;
  };
  let isLinked: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    gameFacadeStub = {
      peekSession: vi.fn().mockName('peekSession').mockReturnValue(of({
        kind: 'ok', response: { state: 'can_start', currentStreak: 0, tracksCount: 3, completedCount: 0 },
      })),
      loadSession: vi.fn().mockName('loadSession'),
      submitAnswer: vi.fn().mockName('submitAnswer'),
      abandonSession: vi.fn().mockName('abandonSession').mockReturnValue(of(void 0)),
      updateListening: vi.fn().mockName('updateListening'),
    };
    apiStub = {
      apiStatsToday: vi.fn().mockName('apiStatsToday').mockReturnValue(of({
        yourScore: 100, medianScore: 100, totalPlayers: 1, currentStreak: 3, tracks: [],
      })),
    };

    isLinked = signal(false);

    store = createStore(gameFacadeStub, apiStub, isLinked);
  });

  it('defaults to not dismissed', () => {
    expect(store.streakToastDismissed()).toBe(false);
  });

  it('resets on peekSession → already_played (via init())', () => {
    store.dismissStreakToast();
    gameFacadeStub.peekSession.mockReturnValue(of({
      kind: 'ok', response: { state: 'already_played', currentStreak: 3, tracksCount: 3, completedCount: 3 },
    }));

    store.init();

    expect(store.state()).toBe('already_played');
    expect(store.streakToastDismissed()).toBe(false);
  });

  it('resets on peekSession → abandoned (via init())', () => {
    store.dismissStreakToast();
    gameFacadeStub.peekSession.mockReturnValue(of({
      kind: 'ok', response: { state: 'abandoned', currentStreak: 3, tracksCount: 3, completedCount: 1 },
    }));

    store.init();

    expect(store.state()).toBe('already_played');
    expect(store.sessionAbandoned()).toBe(true);
    expect(store.streakToastDismissed()).toBe(false);
  });

  it('resets on confirmAbandon()', () => {
    store.dismissStreakToast();
    store['_sessionId'].set(1);

    store.confirmAbandon();

    expect(store.state()).toBe('already_played');
    expect(store.streakToastDismissed()).toBe(false);
  });

  it('resets on nextTrack() reaching the last track (done)', () => {
    store.dismissStreakToast();
    store['_tracks'].set([{ id: 1, previewUrl: null, coverUrl: null } as any]);
    store['_currentIndex'].set(0);

    store.nextTrack();

    expect(store.state()).toBe('done');
    expect(store.streakToastDismissed()).toBe(false);
  });

  it('resets on the 409 branch of loadSession() (via beginGame())', () => {
    store.dismissStreakToast();
    gameFacadeStub.loadSession.mockReturnValue(of({ kind: 'already_played', abandoned: false }));

    store.beginGame();

    expect(store.state()).toBe('already_played');
    expect(store.streakToastDismissed()).toBe(false);
  });
});

describe('GameStore — gel de série', () => {
  let store: GameStore;
  let gameFacadeStub: {
    peekSession: Mock;
    loadSession: Mock;
  };
  let apiStub: {
    apiStatsToday: Mock;
  };
  let isLinked: ReturnType<typeof signal<boolean>>;

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
    gameFacadeStub = {
      peekSession: vi.fn().mockName('peekSession').mockReturnValue(of({
        kind: 'ok', response: { state: 'can_start', currentStreak: 12, tracksCount: 3, completedCount: 0, streak: streak() },
      })),
      loadSession: vi.fn().mockName('loadSession').mockReturnValue(of({
        kind: 'ok', response: { sessionId: 1, tracks: [], currentStreak: 12, isResuming: false, resumeFromPosition: 0, completedAnswers: [] },
      })),
    };
    apiStub = { apiStatsToday: vi.fn().mockName('apiStatsToday').mockReturnValue(of(stats())) };

    store = createStore(gameFacadeStub, apiStub, isLinked);
  });

  afterEach(() => localStorage.removeItem('inseconds.lostStreakNudgeSeen'));

  function finishGame(todayStats: ReturnType<typeof stats>): void {
    apiStub.apiStatsToday.mockReturnValue(of(todayStats));
    store['_tracks'].set([{ id: 1, previewUrl: null, coverUrl: null } as any]);
    store['_currentIndex'].set(0);
    store.nextTrack();
    TestBed.tick(); // les stats du jour arrivent par une resource (chargement asynchrone)
  }

  it('stores the peek streak detail for the header pill', () => {
    store.init();
    expect(store.streakInfo()?.freezes).toBe(2);
  });

  it('refreshes the streak detail after the last answer (freeze used or earned)', () => {
    gameFacadeStub.peekSession.mockReturnValue(of({
      kind: 'ok', response: { state: 'already_played', currentStreak: 13, tracksCount: 3, completedCount: 3, streak: streak({ streak: 13, freezes: 1 }) },
    }));

    finishGame(stats({ freezesUsed: 1 }));

    expect(store.streakInfo()?.freezes).toBe(1);
  });

  it('shows "1 gel a sauvé ta série" to a linked player after a game that used a freeze', () => {
    finishGame(stats({ freezesUsed: 1 }));

    expect(store.showGelUsedToast()).toBe(true);
    expect(store.showGelEarnedToast()).toBe(false);
    expect(store.freezesUsedKey()).toBe('one');
  });

  it('shows "+1 gel gagné" (and not the used toast) when a freeze was earned', () => {
    finishGame(stats({ freezesUsed: 1, freezeMilestone: true }));

    expect(store.showGelEarnedToast()).toBe(true);
    expect(store.showGelUsedToast()).toBe(false);
  });

  it('hides the freeze toasts once dismissed', () => {
    finishGame(stats({ freezeMilestone: true }));

    store.dismissGelToast();

    expect(store.showGelEarnedToast()).toBe(false);
  });

  it('never shows freeze toasts to a guest, but switches the streak toast to "Tu aurais gagné un gel"', () => {
    isLinked.set(false);
    finishGame(stats({ currentStreak: 7, freezeMilestone: true }));

    expect(store.showGelEarnedToast()).toBe(false);
    expect(store.showStreakToast()).toBe(true);
    expect(store.guestFreezeMiss()).toBe(true);
  });

  it('shows the guest "série perdue" toast on welcome, once per lost streak', () => {
    isLinked.set(false);
    gameFacadeStub.peekSession.mockReturnValue(of({
      kind: 'ok', response: {
        state: 'can_start', currentStreak: 0, tracksCount: 3, completedCount: 0,
        streak: streak({ status: 'broken', streak: 0, freezes: 0, maxFreezes: 0, lostStreak: 6, lastPlayedDate: '2026-09-20' }),
      },
    }));

    store.init();

    expect(store.showLostToast()).toBe(true);
    expect(store.lostStreak()).toBe(6);
    expect(localStorage.getItem('inseconds.lostStreakNudgeSeen')).toBe('2026-09-20');

    // Second chargement de la page : déjà vu pour cette série perdue.
    store.dismissLostToast();
    store.init();
    expect(store.showLostToast()).toBe(false);
  });

  it('"Jouer maintenant" (playNow) starts the game from welcome', () => {
    store.init();

    store.playNow();

    expect(gameFacadeStub.loadSession).toHaveBeenCalled();
  });
});

// L'identifiant Deezer n'arrive plus au démarrage (il donnerait la réponse) : le récap le
// lit dans la réponse à chaque morceau, ou dans les réponses déjà données à la reprise.
describe('GameStore — identifiant Deezer révélé après la réponse', () => {
  let store: GameStore;
  let gameFacadeStub: {
    peekSession: Mock;
    loadSession: Mock;
    submitAnswer: Mock;
  };

  beforeEach(() => {
    gameFacadeStub = {
      peekSession: vi.fn().mockName('peekSession'),
      loadSession: vi.fn().mockName('loadSession'),
      submitAnswer: vi.fn().mockName('submitAnswer').mockReturnValue(of({
        artistCorrect: true, titleCorrect: true, score: 1000, correctArtist: 'Eminem',
        correctTitle: 'Lose Yourself', deezerTrackId: 3135556, listenedDurationSeconds: 0.5,
        averageSecondsWhenCorrect: undefined, failureRatePercent: 0, guessTimeDistribution: [],
        notFoundCount: 0, hintLevelUsed: 0, hintPenaltyPercentApplied: 0,
      })),
    };
    store = createStore(gameFacadeStub, { apiStatsToday: vi.fn().mockName('apiStatsToday') }, signal(false));
  });

  it('takes the Deezer id of an answered track from the answer response', () => {
    store['_sessionId'].set(1);
    store['_tracks'].set([{ id: 7, position: 1, previewUrl: 'x', coverUrl: undefined }]);
    store['_currentIndex'].set(0);

    store.submitAnswer({
      trackId: 7, listenedDurationSeconds: 0.5, wasExtended: false, artistAnswer: 'Eminem', titleAnswer: 'Lose Yourself',
    }).subscribe();

    expect(store.results()[0].deezerTrackId).toBe(3135556);
  });

  it('takes the Deezer id of already answered tracks from the resumed answers', () => {
    store['_tracks'].set([
      { id: 7, position: 1, previewUrl: 'x', coverUrl: undefined },
      { id: 8, position: 2, previewUrl: 'y', coverUrl: undefined },
    ]);
    store['_resumeCompletedAnswers'].set([{
        position: 1, artistCorrect: true, titleCorrect: false, score: 500, listenedDurationSeconds: 1,
        correctArtist: 'Eminem', correctTitle: 'Lose Yourself', deezerTrackId: 3135556,
      }]);

    store['resumePlaying']();

    expect(store.results()[0].deezerTrackId).toBe(3135556);
  });
});

// Échec réseau définitif à la soumission (E5) : plus de faux résultat à 0 poussé dans
// `results()` ni d'avancée silencieuse — sinon la partie ne se termine jamais côté serveur
// (le back ne clôt la session qu'après TracksPerChallenge réponses réellement enregistrées).
describe('GameStore — échec réseau à la soumission d\'une réponse', () => {
  let store: GameStore;

  beforeEach(() => {
    const gameFacadeStub = {
      peekSession: vi.fn().mockName('peekSession'),
      loadSession: vi.fn().mockName('loadSession'),
      submitAnswer: vi.fn().mockName('submitAnswer').mockReturnValue(throwError(() => new Error('network'))),
    };
    store = createStore(gameFacadeStub, { apiStatsToday: vi.fn().mockName('apiStatsToday') }, signal(false));
  });

  it('ne pousse aucun résultat ni score sur un échec de soumission', () => {
    store['_sessionId'].set(1);
    store['_tracks'].set([{ id: 7, position: 1, previewUrl: 'x', coverUrl: undefined }]);
    store['_currentIndex'].set(0);
    store['_totalScore'].set(0);

    const error = vi.fn();
    store.submitAnswer({
      trackId: 7, listenedDurationSeconds: 5, wasExtended: false, artistAnswer: 'Eminem', titleAnswer: 'Lose Yourself',
    }).subscribe({ error });

    expect(error).toHaveBeenCalled();

    expect(store.results()).toEqual([]);
    expect(store.totalScore()).toBe(0);
  });
});

// M13 (revue du 25/09, cf. piège 41 CLAUDE.md racine) : apiStatsToday() est appelé sans
// callback error explicite avant le fix ; loadTodayStats() en pose un (error: () => {}) —
// vérifie que le fix tient, sur les deux points d'entrée qui l'appellent (nextTrack → done,
// et enterAlreadyPlayed(false) → peekSession 'already_played' / loadSession 409).
describe('GameStore — échec réseau de apiStatsToday (piège 41)', () => {
  let store: GameStore;
  let gameFacadeStub: {
    peekSession: Mock;
    loadSession: Mock;
  };
  let apiStub: {
    apiStatsToday: Mock;
  };

  beforeEach(() => {
    gameFacadeStub = {
      // Défaut utilisé par refreshStreakInfo() (appelé sans condition par nextTrack) :
      // un simple peek qui ne fait rien de spécial, chaque test surcharge au besoin.
      peekSession: vi.fn().mockName('peekSession').mockReturnValue(of({ kind: 'error' })),
      loadSession: vi.fn().mockName('loadSession'),
    };
    apiStub = {
      apiStatsToday: vi.fn().mockName('apiStatsToday').mockReturnValue(throwError(() => new Error('network'))),
    };
    store = createStore(gameFacadeStub, apiStub, signal(false));
  });

  it('nextTrack (fin de partie) n\'expose pas l\'erreur et laisse todayStats à null', () => {
    store['_tracks'].set([{ id: 1, previewUrl: null, coverUrl: null } as any]);
    store['_currentIndex'].set(0);

    expect(() => store.nextTrack()).not.toThrow();

    expect(store.state()).toBe('done');
    TestBed.tick(); // laisse la resource échouer : todayStats doit rester null sans lever
    expect(store.todayStats()).toBeNull();
  });

  it('peekSession → already_played n\'expose pas l\'erreur et laisse todayStats à null', () => {
    gameFacadeStub.peekSession.mockReturnValue(of({
      kind: 'ok', response: { state: 'already_played', currentStreak: 3, tracksCount: 3, completedCount: 3 },
    }));

    expect(() => store.init()).not.toThrow();

    expect(store.state()).toBe('already_played');
    TestBed.tick(); // laisse la resource échouer : todayStats doit rester null sans lever
    expect(store.todayStats()).toBeNull();
  });

  it('loadSession → 409 already_played n\'expose pas l\'erreur et laisse todayStats à null', () => {
    gameFacadeStub.loadSession.mockReturnValue(of({ kind: 'already_played', abandoned: false }));

    expect(() => store.beginGame()).not.toThrow();

    expect(store.state()).toBe('already_played');
    TestBed.tick(); // laisse la resource échouer : todayStats doit rester null sans lever
    expect(store.todayStats()).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { Observable, defer, of, throwError } from 'rxjs';
import { DailyClient, StartSessionResponse, SubmitAnswerResponse, TodayResponse } from '../../api/daily/api.generated';
import { DailyApi } from './daily.api';

const STREAK = {
  status: 'protected', streak: 12, freezes: 1, maxFreezes: 2, freezeEveryDays: 7, nextFreezeInDays: 3, missedDays: 1,
  lostStreak: undefined, lastPlayedDate: '2026-10-06',
};

/** Une erreur comme le client généré la lève pour une réponse `ProblemDetails` : le statut et le code de l'API. */
const problem = (status: number, code: string) => ({ status, code, traceId: 't' });

describe('DailyApi', () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let api: DailyApi;

  beforeEach(() => {
    client = {
      getToday: vi.fn(), startSession: vi.fn(), submitAnswer: vi.fn(), requestHint: vi.fn(), getTodayStats: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: DailyClient, useValue: client }] });
    api = TestBed.inject(DailyApi);
  });

  afterEach(() => vi.useRealTimers());

  it("lit la série en types du domaine : date en texte, `undefined` devient `null`", async () => {
    const today = { state: 'resumable', tracksCount: 5, completedCount: 2, streak: STREAK } as unknown as TodayResponse;
    client['getToday'].mockReturnValue(of(today));

    const result = await api.today();

    expect(result.state).toBe('resumable');
    expect(result.completedCount).toBe(2);
    expect(result.streak).toEqual({
      status: 'protected', streak: 12, freezes: 1, maxFreezes: 2, freezeEveryDays: 7, nextFreezeInDays: 3, missedDays: 1,
      lostStreak: null, lastPlayedDate: '2026-10-06',
    });
  });

  it("une date reçue comme `Date` (le type que le client annonce) devient le même texte", async () => {
    const date = new Date('2026-10-06T00:00:00Z');
    client['getToday'].mockReturnValue(of({ state: 'can_start', tracksCount: 5, completedCount: 0, streak: { ...STREAK, lastPlayedDate: date } }));

    expect((await api.today()).streak.lastPlayedDate).toBe('2026-10-06');
  });

  describe('start', () => {
    const started = {
      sessionId: 9, tracks: [{ position: 1, previewUrl: 'u1' }], streak: STREAK, isResuming: true, nextPosition: 2,
      completedAnswers: [{ position: 1, artistCorrect: true, titleCorrect: false, score: 425, listenedSeconds: 1, hintLevel: 0, correctArtist: 'A', correctTitle: 'T', deezerTrackId: 3, coverUrl: undefined }],
      currentTrack: { position: 2, listenedSeconds: 2, hintLevel: 1, hintFacts: [{ kind: 'year', value: undefined }] },
    } as unknown as StartSessionResponse;

    it('rend la partie en types du domaine, indices et réponses reprises comprises', async () => {
      client['startSession'].mockReturnValue(of(started));

      const outcome = await api.start();

      expect(outcome.kind).toBe('ok');
      if (outcome.kind !== 'ok') return;
      expect(outcome.session.sessionId).toBe(9);
      expect(outcome.session.completedAnswers[0]).toMatchObject({ position: 1, score: 425, coverUrl: null, distribution: [], notFoundCount: 0 });
      expect(outcome.session.currentTrack).toEqual({ position: 2, listenedSeconds: 2, hintLevel: 1, hintFacts: [{ kind: 'year', value: null }] });
    });

    it.each([
      ['daily.already_played', { kind: 'already_played', abandoned: false }],
      ['daily.abandoned', { kind: 'already_played', abandoned: true }],
      ['daily.no_challenge', { kind: 'no_challenge' }],
      ['common.unexpected', { kind: 'error' }],
    ])('un refus %s est une issue du jeu, pas une erreur', async (code, expected) => {
      client['startSession'].mockReturnValue(throwError(() => problem(409, code)));

      expect(await api.start()).toEqual(expected);
    });
  });

  describe('submitAnswer', () => {
    const response = {
      artistCorrect: true, titleCorrect: true, score: 850, correctArtist: 'A', correctTitle: 'T', deezerTrackId: 5, coverUrl: 'c',
      listenedSeconds: 1, averageSecondsWhenCorrect: undefined, failureRatePercent: 10, guessTimeDistribution: [{ durationSeconds: 1, count: 2 }],
      notFoundCount: 3, hintLevelUsed: 0, hintPenaltyPercentApplied: 0, completed: false,
    } as SubmitAnswerResponse;
    const answer = { position: 2, listenedSeconds: 1, wasExtended: false, artist: null, title: 'T' };

    it('envoie la réponse par position et rend la révélation', async () => {
      client['submitAnswer'].mockReturnValue(of(response));

      const result = await api.submitAnswer(11, answer);

      expect(client['submitAnswer']).toHaveBeenCalledWith(11, { position: 2, listenedSeconds: 1, wasExtended: false, artist: undefined, title: 'T' });
      expect(result).toMatchObject({ position: 2, score: 850, averageSecondsWhenCorrect: null, distribution: [{ durationSeconds: 1, count: 2 }] });
    });

    /** Un envoi à froid : chaque souscription (donc chaque essai) rend la réponse suivante de la liste, la dernière à répétition. */
    const attempts = (...outcomes: (() => Observable<SubmitAnswerResponse>)[]) => {
      const state = { count: 0 };
      client['submitAnswer'].mockReturnValue(defer(() => outcomes[Math.min(state.count++, outcomes.length - 1)]()));
      return state;
    };

    it("réessaie une coupure réseau, puis une erreur serveur, avant d'abandonner (piège 32)", async () => {
      vi.useFakeTimers();
      const sent = attempts(() => throwError(() => ({ status: 0 })), () => throwError(() => ({ status: 503 })), () => of(response));

      const pending = api.submitAnswer(11, answer);
      await vi.advanceTimersByTimeAsync(2100);

      expect((await pending).score).toBe(850);
      expect(sent.count).toBe(3);
    });

    it('abandonne après deux réessais', async () => {
      vi.useFakeTimers();
      const sent = attempts(() => throwError(() => ({ status: 500 })));

      const pending = api.submitAnswer(11, answer).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(2100);

      expect(await pending).toEqual({ status: 500 });
      expect(sent.count).toBe(3);
    });

    it('ne réessaie jamais un refus applicatif (409, 400)', async () => {
      const sent = attempts(() => throwError(() => problem(409, 'daily.already_answered')));

      await expect(api.submitAnswer(11, answer)).rejects.toMatchObject({ status: 409 });
      expect(sent.count).toBe(1);
    });
  });

  it('un indice rend tous les indices révélés, valeur vide comprise', async () => {
    client['requestHint'].mockReturnValue(of({ facts: [{ kind: 'year', value: '2013' }, { kind: 'artistMasked', value: undefined }] }) as Observable<unknown>);

    expect(await api.requestHint(11, 1, 2)).toEqual([{ kind: 'year', value: '2013' }, { kind: 'artistMasked', value: null }]);
    expect(client['requestHint']).toHaveBeenCalledWith(11, { position: 1, level: 2 });
  });

  it('les statistiques du jour rendent des nombres et des `null`, pas des `undefined`', async () => {
    client['getTodayStats'].mockReturnValue(of({
      yourScore: undefined, medianScore: 1200, totalPlayers: 4, currentStreak: 2, tracks: [], freezesUsed: 1, freezeMilestone: true,
      minScore: undefined, maxScore: undefined, maxPossibleScore: 5000, scoreDistribution: [{ minScore: 0, maxScore: 500, count: 2 }], betterThanPercent: undefined,
    }));

    const stats = await api.stats();

    expect(stats).toMatchObject({ yourScore: null, minScore: null, betterThanPercent: null, freezeMilestone: true, medianScore: 1200 });
    expect(stats.scoreDistribution).toEqual([{ minScore: 0, maxScore: 500, count: 2 }]);
  });
});

import { TestBed } from '@angular/core/testing';
import { Observable, defer, of, throwError } from 'rxjs';
import { RunChallengeResponse, RunComparisonResponse, RunPlayResponse, RunsClient, RunsMeResponse } from '../../api/runs/api.generated';
import { RunsApi } from './runs.api';

/** Une erreur comme le client généré la lève pour une réponse `ProblemDetails` : le statut et le code de l'API. */
const problem = (status: number, code: string) => ({ status, code, traceId: 't' });

const track = {
  position: 1, round: 1, neutralized: false, artistCorrect: true, titleCorrect: false, points: 50, artist: 'Daft Punk', title: undefined, coverUrl: undefined, deezerTrackId: 3135553,
};

const play = {
  session: {
    sessionId: 7, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 50, roundsPassed: 0,
    round: { round: 1, score: 50, objective: 200, maxScore: 500 }, roundTracks: [track], finish: undefined,
  },
  revealed: track,
  neutralized: [{ position: 2, round: 1, objectiveBefore: 200, objectiveAfter: 160 }],
  roundSummaries: [],
  current: { position: 2, round: 1, positionInRound: 2, previewUrl: '' },
  isResuming: false,
} as unknown as RunPlayResponse;

describe('RunsApi', () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let api: RunsApi;

  beforeEach(() => {
    client = { getRunsMe: vi.fn(), getRunChallenge: vi.fn(), getRunComparison: vi.fn(), launchRun: vi.fn(), joinRun: vi.fn(), refreshRunPreview: vi.fn(), submitRunAnswer: vi.fn(), abandonRun: vi.fn(), swapRunTrack: vi.fn(), getRunHistory: vi.fn(), getRunPastPreview: vi.fn(), getRunHits: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: RunsClient, useValue: client }, RunsApi] });
    api = TestBed.inject(RunsApi);
  });

  afterEach(() => vi.useRealTimers());

  it('lit mon accès, mon record, ma partie en cours et mon étagère', async () => {
    client['getRunsMe'].mockReturnValue(of({
      hasAccess: true, record: { bestScore: 900, bestRoundsPassed: 2, isNew: false }, pending: { sessionId: 7, challengeCode: 'ABC234' },
      shelf: [{ disc: { key: 'runs.discs.wax', stars: 0 }, count: 2 }],
      level: { points: 1380, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: { key: 'runs.discs.gold', stars: 0 }, pointsToNext: 220, progressPercent: 56, provisional: false, runsPlayed: 12, delta: undefined },
    } as RunsMeResponse));

    expect(await api.me()).toEqual({
      hasAccess: true, record: { bestScore: 900, bestRoundsPassed: 2, isNew: false }, pending: { sessionId: 7, challengeCode: 'ABC234' },
      shelf: [{ disc: { key: 'runs.discs.wax', stars: 0 }, count: 2 }],
      level: { points: 1380, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: { key: 'runs.discs.gold', stars: 0 }, pointsToNext: 220, progressPercent: 56, provisional: false, runsPlayed: 12, delta: null },
    });
  });

  it('« Changer de morceau » : le morceau de réserve et ses effets en types du domaine, une carte inconnue ignorée', async () => {
    client['swapRunTrack'].mockReturnValue(of({ ...play, session: { ...play.session, swapAvailable: false }, current: { ...play.current, effects: {
      cards: ['hint', 'futureCard'], year: 1995, artistInitials: undefined, titleInitials: ['G', 'L'], choices: undefined,
    } } } as unknown as RunPlayResponse));

    const result = await api.swap(7, 3);

    expect(client['swapRunTrack']).toHaveBeenCalledWith(7, { position: 3 });
    expect(result.session.swapAvailable).toBe(false);
    expect(result.current?.effects).toEqual({ cards: ['hint'], year: 1995, artistInitials: null, titleInitials: ['G', 'L'], choices: null, genre: null });
  });

  it('sans record ni partie en cours : `null` plutôt que `undefined`', async () => {
    client['getRunsMe'].mockReturnValue(of({ hasAccess: false } as RunsMeResponse));

    expect(await api.me()).toEqual({ hasAccess: false, record: null, pending: null, shelf: [], level: null });
  });

  it('rend la partie en types du domaine : `undefined` devient `null`, un extrait vide aussi', async () => {
    client['launchRun'].mockReturnValue(of(play));

    const outcome = await api.launch();

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.play.session.round).toEqual({ round: 1, score: 50, objective: 200, maxScore: 500 });
    expect(outcome.play.session.finish).toBeNull();
    expect(outcome.play.session.ghost).toBeNull();
    expect(outcome.play.revealed).toMatchObject({ artist: 'Daft Punk', title: null, coverUrl: null, deezerTrackId: 3135553 });
    expect(outcome.play.current).toEqual({ position: 2, round: 1, positionInRound: 2, previewUrl: null, waveform: null, effects: null });
    expect(outcome.play.neutralized).toEqual([{ position: 2, round: 1, objectiveBefore: 200, objectiveAfter: 160 }]);
  });

  it('reprend une partie par le code de sa playlist', async () => {
    client['joinRun'].mockReturnValue(of(play));

    await api.join('ABC234');

    expect(client['joinRun']).toHaveBeenCalledWith('ABC234');
  });

  describe('refus du lancement', () => {
    it.each([
      ['runs.access_denied', { kind: 'access_denied' }],
      ['runs.no_challenge', { kind: 'no_challenge' }],
      ['runs.already_played', { kind: 'already_played', abandoned: false }],
      ['runs.abandoned', { kind: 'already_played', abandoned: true }],
      ['common.unexpected', { kind: 'error' }],
    ])('%s est une issue, pas une erreur', async (code, expected) => {
      client['launchRun'].mockReturnValue(throwError(() => problem(409, code)));

      expect(await api.launch()).toEqual(expected);
    });
  });

  describe('envoi d\'une réponse', () => {
    const answer = { position: 1, artist: 'Daft Punk', title: null };

    const attempts = (...outcomes: (() => Observable<RunPlayResponse>)[]) => {
      const state = { count: 0 };
      client['submitRunAnswer'].mockReturnValue(defer(() => outcomes[Math.min(state.count++, outcomes.length - 1)]()));
      return state;
    };

    it('envoie la position, l\'artiste et le titre (vide : absent)', async () => {
      attempts(() => of(play));

      await api.submitAnswer(7, answer);

      expect(client['submitRunAnswer']).toHaveBeenCalledWith(7, { position: 1, artist: 'Daft Punk', title: undefined });
    });

    it("réessaie une coupure réseau, puis une erreur serveur, avant d'abandonner (piège 32)", async () => {
      vi.useFakeTimers();
      const sent = attempts(() => throwError(() => ({ status: 0 })), () => throwError(() => ({ status: 503 })), () => of(play));

      const pending = api.submitAnswer(7, answer);
      await vi.advanceTimersByTimeAsync(2100);

      expect((await pending).session.sessionId).toBe(7);
      expect(sent.count).toBe(3);
    });

    it('abandonne après deux réessais', async () => {
      vi.useFakeTimers();
      const sent = attempts(() => throwError(() => ({ status: 500 })));

      const pending = api.submitAnswer(7, answer).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(2100);

      expect(await pending).toEqual({ status: 500 });
      expect(sent.count).toBe(3);
    });

    it('ne réessaie jamais un refus applicatif (409, 400)', async () => {
      const sent = attempts(() => throwError(() => problem(409, 'runs.already_answered')));

      await expect(api.submitAnswer(7, answer)).rejects.toMatchObject({ status: 409 });
      expect(sent.count).toBe(1);
    });
  });

  describe("le lien d'une playlist", () => {
    const link = {
      code: 'ABC234', authorPseudo: undefined, trackCount: 20, rounds: 4, tracksPerRound: 5, listenSeconds: 10, answerSeconds: 45, myStatus: 'none', mySessionId: undefined,
    } as RunChallengeResponse;

    it('rend les règles de la playlist et la partie du joueur dessus, en types du domaine', async () => {
      client['getRunChallenge'].mockReturnValue(of(link));

      expect(await api.challenge('abc234')).toEqual({
        kind: 'ok',
        link: { code: 'ABC234', authorPseudo: null, trackCount: 20, rounds: 4, tracksPerRound: 5, listenSeconds: 10, answerSeconds: 45, myStatus: 'none', mySessionId: null, themes: [] },
      });
      expect(client['getRunChallenge']).toHaveBeenCalledWith('abc234');
    });

    it('une partie finie ou en cours garde son identifiant ; un statut inconnu vaut « en cours »', async () => {
      client['getRunChallenge'].mockReturnValue(of({ ...link, authorPseudo: 'Clément', myStatus: 'won', mySessionId: 7 }));
      expect(await api.challenge('ABC234')).toMatchObject({ link: { authorPseudo: 'Clément', myStatus: 'won', mySessionId: 7 } });

      client['getRunChallenge'].mockReturnValue(of({ ...link, myStatus: 'autre' }));
      expect(await api.challenge('ABC234')).toMatchObject({ link: { myStatus: 'pending' } });
    });

    it('une playlist inconnue est une issue, pas une erreur ; toute autre erreur est une erreur', async () => {
      client['getRunChallenge'].mockReturnValue(throwError(() => problem(404, 'runs.challenge_not_found')));
      expect(await api.challenge('ZZZZZZ')).toEqual({ kind: 'not_found' });

      client['getRunChallenge'].mockReturnValue(throwError(() => problem(500, 'common.unexpected')));
      expect(await api.challenge('ABC234')).toEqual({ kind: 'error' });
    });
  });

  describe('la comparaison', () => {
    it('rend une ligne par partie : `undefined` devient `null` (invité, manche non jouée)', async () => {
      client['getRunComparison'].mockReturnValue(of({
        code: 'ABC234', authorPseudo: 'Clément', playerCount: 2, roundCount: 4,
        rows: [
          { pseudo: 'Clément', disc: { key: 'runs.discs.gold', stars: 0 }, rounds: [500, 600, 700, 800], totalScore: 2600, isMe: false },
          { pseudo: undefined, disc: { key: 'runs.discs.wax', stars: 0 }, rounds: [480, 0, undefined, undefined], totalScore: 480, isMe: true },
        ],
      } as RunComparisonResponse));

      const comparison = await api.comparison('ABC234');

      expect(comparison.rows[1]).toEqual({ pseudo: null, disc: { key: 'runs.discs.wax', stars: 0 }, rounds: [480, 0, null, null], totalScore: 480, isMe: true, tag: null });
      expect(comparison).toMatchObject({ code: 'ABC234', authorPseudo: 'Clément', playerCount: 2, roundCount: 4 });
    });

    it("laisse remonter l'erreur (comparaison fermée)", async () => {
      client['getRunComparison'].mockReturnValue(throwError(() => problem(409, 'runs.comparison_locked')));

      await expect(api.comparison('ABC234')).rejects.toMatchObject({ code: 'runs.comparison_locked' });
    });
  });

  it('abandonne la partie par son identifiant', async () => {
    client['abandonRun'].mockReturnValue(of(undefined));

    await api.abandon(7);

    expect(client['abandonRun']).toHaveBeenCalledWith(7);
  });

  describe('historique', () => {
    it('lit un mois en types du domaine', async () => {
      client['getRunHistory'].mockReturnValue(of({
        month: '2026-11', previousMonth: undefined, nextMonth: undefined, playedCount: 2, averageScore: 2640, bestScore: 3420,
        runs: [{ sessionId: 7, challengeCode: 'ABC234', date: '2026-11-11', status: 'won', disc: { key: 'runs.discs.gold', stars: 0 }, roundsPassed: 4, score: 3420, difficulty: 'risky' }],
      }));

      const history = await api.history('2026-11');

      expect(client['getRunHistory']).toHaveBeenCalledWith('2026-11');
      expect(history).toEqual({
        month: '2026-11', previousMonth: null, nextMonth: null, playedCount: 2, averageScore: 2640, bestScore: 3420,
        runs: [{ sessionId: 7, date: '2026-11-11', disc: { key: 'runs.discs.gold', stars: 0 }, score: 3420, difficulty: 'risky' }],
      });
    });

    it("un navigateur inconnu du serveur (401) a un historique vide ; une autre erreur remonte", async () => {
      client['getRunHistory'].mockReturnValueOnce(throwError(() => problem(401, 'common.unauthorized'))).mockReturnValueOnce(throwError(() => problem(500, 'common.unexpected')));

      expect((await api.history(null)).runs).toEqual([]);
      await expect(api.history(null)).rejects.toBeDefined();
    });

    it("les Hits : vides en null, aucun pour un navigateur inconnu (401), une autre erreur remonte", async () => {
      client['getRunHits']
        .mockReturnValueOnce(of({ hits: [{ key: 'first_setlist', earned: true }, { key: 'ten_setlists', earned: false, progress: 7, target: 10 }], earnedCount: 1 }))
        .mockReturnValueOnce(throwError(() => problem(401, 'common.unauthorized')))
        .mockReturnValueOnce(throwError(() => problem(500, 'common.unexpected')));

      expect(await api.hits()).toEqual([
        { key: 'first_setlist', earned: true, progress: null, target: null }, { key: 'ten_setlists', earned: false, progress: 7, target: 10 },
      ]);
      expect(await api.hits()).toEqual([]);
      await expect(api.hits()).rejects.toBeDefined();
    });

    it("l'extrait d'un morceau joué : son adresse, `null` sans extrait", async () => {
      client['getRunPastPreview'].mockReturnValueOnce(of({ previewUrl: 'https://preview/3.mp3' })).mockReturnValueOnce(of({}));

      expect(await api.pastPreviewUrl(7, 3)).toBe('https://preview/3.mp3');
      expect(client['getRunPastPreview']).toHaveBeenCalledWith(7, 3);
      expect(await api.pastPreviewUrl(7, 4)).toBeNull();
    });
  });
});

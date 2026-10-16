import { TestBed } from '@angular/core/testing';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { ChallengeStats } from '../domain/challenge';
import { AdminCounts } from './admin-counts';
import { ChallengesStore } from './challenges.store';
import {
  FakeChallengesApi, challengeStats, fakeChallengesApi, historyEntry, provideChallengesApiFake,
} from './testing/fake-challenges-api';
import { problem } from './testing/fake-catalogue-api';

describe('ChallengesStore', () => {
  const october5 = challengeStats({ id: 5, date: '2026-10-05' });
  const october4 = challengeStats({ id: 4, date: '2026-10-04' });
  const september30 = challengeStats({ id: 3, date: '2026-09-30' });

  let api: FakeChallengesApi;
  let copy: ReturnType<typeof vi.fn>;
  let store: InstanceType<typeof ChallengesStore>;

  async function setup(overrides: Partial<FakeChallengesApi> = {}, options: { load?: boolean } = {}) {
    api = fakeChallengesApi({
      loadStats: vi.fn(async () => [october5, october4, september30]),
      listHistory: vi.fn(async () => [
        historyEntry({ id: 5, date: '2026-10-05' }), historyEntry({ id: 3, date: '2026-09-30' }), historyEntry({ id: 1, date: '2026-08-12' }),
      ]),
      ...overrides,
    });
    copy = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [ChallengesStore, provideChallengesApiFake(api), { provide: ClipboardService, useValue: { copy } }],
    });
    store = TestBed.inject(ChallengesStore);
    if (options.load !== false) await store.load();
  }

  afterEach(() => vi.useRealTimers());

  describe('chargement', () => {
    it('lit les stats et l\'historique ensemble et annonce le nombre de défis', async () => {
      await setup();

      expect(api.loadStats).toHaveBeenCalledTimes(1);
      expect(api.listHistory).toHaveBeenCalledTimes(1);
      expect(store.isFulfilled()).toBe(true);
      expect(store.stats()).toHaveLength(3);
      expect(TestBed.inject(AdminCounts).challenges()).toBe(3);
    });

    it('ne lit rien avant load()', async () => {
      await setup({}, { load: false });

      expect(api.loadStats).not.toHaveBeenCalled();
      expect(api.listHistory).not.toHaveBeenCalled();
      expect(TestBed.inject(AdminCounts).challenges()).toBeNull();
    });

    it('garde l\'erreur de l\'API et ne compte rien', async () => {
      await setup({ loadStats: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

      expect(store.error()?.code).toBe('common.unexpected');
      expect(TestBed.inject(AdminCounts).challenges()).toBeNull();
    });

    it('une lecture plus ancienne, arrivée après une plus récente, n\'écrit rien', async () => {
      await setup();
      let answerOld!: (stats: ChallengeStats[]) => void;
      api.loadStats
        .mockReturnValueOnce(new Promise<ChallengeStats[]>(resolve => { answerOld = resolve; }))
        .mockResolvedValueOnce([october5]);

      const old = store.load();
      await store.load();
      answerOld([]);
      await old;

      expect(store.stats()).toEqual([october5]);
    });
  });

  describe('mois', () => {
    it('affiche le mois le plus récent qui a des défis (aucun dans le mois courant)', async () => {
      await setup();

      expect(store.months()).toEqual(['2026-10', '2026-09', '2026-08']);
      expect(store.month()).toBe('2026-10');
      expect(store.statsForMonth().map(c => c.id)).toEqual([5, 4]);
      expect(store.historyForMonth().map(c => c.id)).toEqual([5]);
    });

    it('change de mois avec les flèches, dans les bornes', async () => {
      await setup();
      expect(store.canGoNext()).toBe(false);
      expect(store.canGoPrevious()).toBe(true);

      store.shiftMonth(-1);
      expect(store.month()).toBe('2026-09');
      expect(store.statsForMonth().map(c => c.id)).toEqual([3]);

      store.shiftMonth(-1);
      expect(store.month()).toBe('2026-08');
      expect(store.statsForMonth()).toEqual([]);
      expect(store.canGoPrevious()).toBe(false);

      store.shiftMonth(-1);
      expect(store.month()).toBe('2026-08');
      store.shiftMonth(1);
      expect(store.month()).toBe('2026-09');
    });

    it('lâche le joueur surligné en changeant de mois', async () => {
      await setup();
      store.toggleHighlight('p1');

      store.shiftMonth(-1);

      expect(store.highlightedPlayerId()).toBeNull();
    });
  });

  it('déplie et replie un défi', async () => {
    await setup();

    store.toggleExpanded(5);
    store.toggleExpanded(4);
    expect(store.expandedIds()).toEqual([5, 4]);

    store.toggleExpanded(5);
    expect(store.expandedIds()).toEqual([4]);
  });

  it('surligne un joueur, puis le lâche au second clic ou le remplace par un autre', async () => {
    await setup();

    store.toggleHighlight('p1');
    expect(store.highlightedPlayerId()).toBe('p1');
    store.toggleHighlight('p2');
    expect(store.highlightedPlayerId()).toBe('p2');
    store.toggleHighlight('p2');
    expect(store.highlightedPlayerId()).toBeNull();
  });

  describe('copie de l\'identifiant', () => {
    it('copie l\'identifiant complet et affiche « Copié ! » 1,5 s', async () => {
      await setup();
      vi.useFakeTimers();

      await store.copyPlayerId('aaaaaaaa-1111');
      expect(copy).toHaveBeenCalledWith('aaaaaaaa-1111');
      expect(store.copiedPlayerId()).toBe('aaaaaaaa-1111');

      vi.advanceTimersByTime(1500);
      expect(store.copiedPlayerId()).toBeNull();
    });

    it('n\'affiche rien quand la copie échoue', async () => {
      await setup();
      copy.mockResolvedValueOnce(false);

      await store.copyPlayerId('aaaaaaaa-1111');

      expect(store.copiedPlayerId()).toBeNull();
    });
  });

  describe('recalcul', () => {
    const frozen = challengeStats({ id: 4, date: '2026-10-04', canRecompute: true, computedAt: '2026-10-05T00:05:00Z', playerCount: 1 });

    it('remplace le défi par la réponse, avec un état « en cours » le temps de l\'appel', async () => {
      const recomputed = challengeStats({ id: 4, date: '2026-10-04', canRecompute: false, computedAt: '2026-10-09T10:00:00Z', playerCount: 7 });
      let answer!: (stats: typeof recomputed) => void;
      await setup({
        loadStats: vi.fn(async () => [october5, frozen]),
        recompute: vi.fn(() => new Promise<typeof recomputed>(resolve => { answer = resolve; })),
      });

      const running = store.recompute('2026-10-04');
      expect(store.recomputingDays()).toEqual(['2026-10-04']);
      answer(recomputed);
      await running;

      expect(api.recompute).toHaveBeenCalledWith('2026-10-04');
      expect(store.recomputingDays()).toEqual([]);
      expect(store.stats().map(c => c.playerCount)).toEqual([1, 7]);
      expect(store.stats()[1].computedAt).toBe('2026-10-09T10:00:00Z');
    });

    it('ne relance pas un recalcul déjà en cours pour ce jour', async () => {
      await setup({ loadStats: vi.fn(async () => [frozen]), recompute: vi.fn(() => new Promise<never>(() => undefined)) });

      void store.recompute('2026-10-04');
      await store.recompute('2026-10-04');

      expect(api.recompute).toHaveBeenCalledTimes(1);
    });

    it('garde l\'erreur du recalcul (jour pas fini) et laisse le défi tel quel', async () => {
      await setup({
        loadStats: vi.fn(async () => [frozen]),
        recompute: vi.fn(async () => Promise.reject(problem(409, 'admin.day_not_over'))),
      });

      await store.recompute('2026-10-04');

      expect(store.recomputeErrors()['2026-10-04'].code).toBe('admin.day_not_over');
      expect(store.recomputingDays()).toEqual([]);
      expect(store.stats()).toEqual([frozen]);
    });

    it('efface l\'erreur au recalcul suivant', async () => {
      await setup({ loadStats: vi.fn(async () => [frozen]) });
      api.recompute.mockRejectedValueOnce(problem(409, 'admin.day_not_over'));
      await store.recompute('2026-10-04');
      expect(store.recomputeErrors()['2026-10-04']).toBeDefined();

      await store.recompute('2026-10-04');

      expect(store.recomputeErrors()['2026-10-04']).toBeUndefined();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { EMPTY_STREAK, Streak } from '../domain/streak';
import { HomeStore } from './home.store';
import { ANSWERED, FakeDailyApi, STATS, TODAY, provideFakeDailyApi } from './testing/fake-daily-api';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('HomeStore', () => {
  let api: FakeDailyApi;
  let store: InstanceType<typeof HomeStore>;

  beforeEach(() => {
    api = new FakeDailyApi();
    TestBed.configureTestingModule({ providers: [provideFakeDailyApi(api), HomeStore] });
    store = TestBed.inject(HomeStore);
  });

  describe('arrivée sur la page', () => {
    it("montre l'accueil sans rien créer (la partie ne part qu'au clic)", async () => {
      await store.init();

      expect(store.screen()).toBe('welcome');
      expect(store.peekTracksCount()).toBe(3);
      expect(api.calls).toEqual(['today']);
    });

    it('propose la reprise avec ce qui est déjà répondu', async () => {
      api.today = TODAY({ state: 'resumable', completedCount: 2 });

      await store.init();

      expect(store.screen()).toBe('resume_prompt');
      expect(store.peekCompletedCount()).toBe(2);
    });

    it("« déjà joué » charge les statistiques du jour, pas une partie abandonnée", async () => {
      api.today = TODAY({ state: 'already_played' });
      await store.init();
      await flush();
      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(false);
      expect(store.stats()?.yourScore).toBe(2550);

      api.calls.length = 0;
      api.today = TODAY({ state: 'abandoned' });
      await store.init();
      expect(store.abandoned()).toBe(true);
      // Une partie abandonnée relit les stats (score partiel et réponses), mais pas l'encart d'hier.
      expect(api.calls).toContain('stats');
      expect(api.calls.some(c => c.startsWith('archiveDay'))).toBe(false);
    });

    it('sans défi : écran « pas de défi » ; échec réseau : écran d\'erreur', async () => {
      api.today = TODAY({ state: 'no_challenge', tracksCount: 0 });
      await store.init();
      expect(store.screen()).toBe('no_challenge');

      api.today = new Error('réseau');
      await store.init();
      expect(store.screen()).toBe('error');
    });

    it("l'échec des statistiques du jour n'empêche pas l'écran (piège 41)", async () => {
      api.today = TODAY({ state: 'already_played' });
      api.stats = new Error('500');

      await store.init();
      await flush();

      expect(store.screen()).toBe('already_played');
      expect(store.stats()).toBeNull();
    });
  });

  describe('abandon depuis la reprise', () => {
    it("depuis l'écran de reprise : retrouve la partie, puis l'abandonne", async () => {
      api.today = TODAY({ state: 'resumable', completedCount: 1 });
      await store.init();

      await store.abandonFromResume();

      expect(api.calls.slice(-3)).toEqual(['start', 'abandon 11', 'stats']);
      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(true);
    });

    it('la partie finie entre-temps dans un autre onglet mène à « déjà joué »', async () => {
      api.today = TODAY({ state: 'resumable', completedCount: 1 });
      await store.init();
      api.start = { kind: 'already_played', abandoned: false };

      await store.abandonFromResume();

      expect(api.calls).not.toContain('abandon 11');
      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(false);
      expect(store.abandonLoading()).toBe(false);
    });
  });

  describe('retour de l\'onglet au premier plan (plusieurs onglets)', () => {
    it("depuis l'accueil, une partie démarrée ailleurs propose la reprise", async () => {
      await store.init();
      api.today = TODAY({ state: 'resumable', completedCount: 1 });

      store.refresh();
      await flush();

      expect(store.screen()).toBe('resume_prompt');
    });

    it('sans effet sur un écran de fin (le récap ne change pas)', async () => {
      api.today = TODAY({ state: 'already_played' });
      await store.init();
      api.calls.length = 0;

      store.refresh();

      expect(api.calls).toEqual([]);
    });
  });

  describe('une partie jouée sur la manche', () => {
    it("une partie lancée rend l'état lu périmé : l'accueil le relit en y revenant", async () => {
      await store.init();
      expect(store.stale()).toBe(false);

      store.roundStarted(EMPTY_STREAK);
      expect(store.stale()).toBe(true);

      api.today = TODAY({ state: 'resumable', completedCount: 1 });
      await store.init();
      expect(store.stale()).toBe(false);
      expect(store.screen()).toBe('resume_prompt');
    });

    it('la fin de la partie montre le résultat avec les statistiques du jour et la série relues', async () => {
      await store.init();
      store.roundStarted(EMPTY_STREAK);
      const results = [1, 2, 3].map(position => ANSWERED(position));

      store.finishGame(results, 3);
      await flush();

      expect(store.screen()).toBe('done');
      expect(store.stale()).toBe(false);
      expect(store.totalScore()).toBe(2550);
      expect(store.canShare()).toBe(true);
      expect(api.calls).toContain('stats');
      expect(api.calls.filter(c => c === 'today')).toHaveLength(2);
      store.stopCountdown();
    });

    it('une partie incomplète ne se partage pas', async () => {
      await store.init();

      store.finishGame([ANSWERED(1)], 3);

      expect(store.canShare()).toBe(false);
      store.stopCountdown();
    });

    it('le panneau de série lit les parties jouées avec la série : rien avant, puis relues après la dernière réponse', async () => {
      expect(store.sheetGamesPlayed()).toBeNull();
      api.today = TODAY({ completedGames: 4 });
      await store.init();
      expect(store.sheetGamesPlayed()).toBe(4);

      api.today = TODAY({ state: 'already_played', completedGames: 5 });
      store.finishGame([1, 2, 3].map(position => ANSWERED(position)), 3);
      await flush();

      expect(store.sheetGamesPlayed()).toBe(5);
      store.stopCountdown();
    });

    it("gamesPlayed compte la partie du jour une fois, jamais deux (la ligne d'installation attend la 2e partie)", async () => {
      expect(store.gamesPlayed()).toBeNull();
      api.today = TODAY({ completedGames: 1 });
      await store.init();
      expect(store.gamesPlayed()).toBe(1);

      api.today = TODAY({ state: 'already_played', completedGames: 2 });
      store.finishGame([1, 2, 3].map(position => ANSWERED(position)), 3);
      await flush();

      expect(store.gamesPlayed()).toBe(2);
      store.stopCountdown();
    });

    it("un démarrage en échec dit pourquoi sur l'accueil (pas de défi, erreur)", async () => {
      await store.init();
      store.roundStarted(EMPTY_STREAK);

      store.fail('no_challenge');
      expect(store.screen()).toBe('no_challenge');
      expect(store.stale()).toBe(false);

      store.fail('error');
      expect(store.screen()).toBe('error');
    });

    it('une partie abandonnée ou finie ailleurs mène à « déjà joué »', async () => {
      await store.init();

      store.enterAlreadyPlayed(true);
      await flush();

      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(true);
      store.stopCountdown();
    });
  });

  describe('série, gels et tuile invité', () => {
    const lost: Streak = { ...EMPTY_STREAK, lostStreak: 9, lastPlayedDate: '2026-10-01' };
    const signIn = () => TestBed.inject(SessionStore).signedIn({ id: 'p', pseudo: 'Alice', email: 'a@b.fr', isGuest: false, isAdmin: false });

    it("un invité voit la tuile « série perdue » annoncée par la page, sur l'accueil", async () => {
      api.today = TODAY({ streak: lost });
      await store.init();
      // Le store ne décide pas seul : la page lui annonce la série (une seule fois par série perdue, `LostStreakNotice`).
      expect(store.guestTile()).toBeNull();

      store.announceLostStreak(9);
      expect(store.guestTile()).toBe('lost');
      expect(store.lostStreak()).toBe(9);
    });

    it('un compte ne voit jamais la tuile invité', async () => {
      signIn();
      api.today = TODAY({ streak: lost, completedGames: 3 });

      await store.init();
      store.announceLostStreak(9);

      expect(store.guestTile()).toBeNull();
    });

    it("un invité qui a déjà joué voit « Garde tes parties » sur l'accueil, pas le nouveau venu", async () => {
      api.today = TODAY({ completedGames: 0 });
      await store.init();
      expect(store.guestTile()).toBeNull();

      api.today = TODAY({ completedGames: 2 });
      await store.init();
      expect(store.guestTile()).toBe('returning');
    });

    it('un compte voit « +1 gel gagné » sur le récap quand la partie du jour en a gagné un', async () => {
      signIn();
      api.today = TODAY({ state: 'already_played' });
      api.stats = STATS({ freezeMilestone: true });

      await store.init();
      await flush();

      expect(store.toasts().gelEarned).toBe(true);
      expect(store.guestTile()).toBeNull();
    });

    it("un invité voit « Ta partie est sur ce téléphone » sur le récap, avec la série des statistiques du jour", async () => {
      api.today = TODAY({ state: 'already_played', completedGames: 1 });
      api.stats = STATS({ currentStreak: 5 });

      await store.init();
      await flush();

      expect(store.guestTile()).toBe('afterGame');
      expect(store.toastStreak()).toBe(5);
      expect(store.toastStreakKey()).toBe('other');
    });

    it("un invité au palier de gel voit « Tu aurais gagné un gel », qui ne revient pas pour la même série une fois fermé", async () => {
      api.today = TODAY({ state: 'already_played', completedGames: 7 });
      api.stats = STATS({ currentStreak: 7, freezeMilestone: true });
      await store.init();
      await flush();
      expect(store.guestTile()).toBe('freezeMiss');

      const dismissal = store.dismissGuestTile();
      expect(dismissal.streak).toBe(7);
      expect(store.guestTile()).toBeNull();

      // Visite suivante : la page rend au store la fermeture gardée dans le navigateur.
      store.restoreGuestTileDismissal(dismissal);
      await store.init();
      await flush();
      expect(store.guestTile()).toBeNull();
    });
  });

  describe('compte à rebours', () => {
    it('part en entrant sur un écran de fin et se lit en hh:mm:ss', async () => {
      api.today = TODAY({ state: 'already_played' });

      await store.init();

      expect(store.countdown()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(store.secondsLeft()).toBeGreaterThan(0);
      store.stopCountdown();
    });
  });
});

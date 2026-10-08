import { TestBed } from '@angular/core/testing';
import { SessionLoader } from '../../account/data-access/session-loader';
import { SessionStore } from '../../core/session/session.store';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { FakeAudioPort, provideFakeAudio } from '../../gameplay/data-access/testing/fake-audio.port';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RoundSubmission } from '../../gameplay/domain/track-round';
import { EMPTY_STREAK, Streak } from '../domain/streak';
import { DailyGameStore } from './daily-game.store';
import { ANSWERED, FakeDailyApi, SESSION, STATS, TODAY, provideFakeDailyApi } from './testing/fake-daily-api';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('DailyGameStore', () => {
  let api: FakeDailyApi;
  let audio: FakeAudioPort;
  let storage: MemoryStoragePort;
  let guestCreated: number;
  let store: InstanceType<typeof DailyGameStore>;
  let round: InstanceType<typeof TrackRoundStore>;

  beforeEach(() => {
    api = new FakeDailyApi();
    audio = new FakeAudioPort();
    storage = new MemoryStoragePort();
    guestCreated = 0;
    TestBed.configureTestingModule({
      providers: [
        provideFakeDailyApi(api),
        provideFakeAudio(audio),
        { provide: StoragePort, useValue: storage },
        { provide: SessionLoader, useValue: { ensureGuest: async () => { guestCreated++; } } },
        TrackRoundStore,
        DailyGameStore,
      ],
    });
    store = TestBed.inject(DailyGameStore);
    round = TestBed.inject(TrackRoundStore);
  });

  const submissionOf = (position: number, seconds = 1): RoundSubmission =>
    ({ trackId: position, listenedSeconds: seconds, wasExtended: false, artist: 'A', title: 'T' });

  /** Démarre la partie et laisse le lecteur annoncer son extrait prêt. */
  async function startGame(): Promise<void> {
    await store.init();
    await store.begin();
    audio.emit('ready');
    TestBed.tick();
  }

  describe('arrivée sur la page', () => {
    it("montre l'accueil sans lancer aucun son (il faut un clic)", async () => {
      await store.init();

      expect(store.screen()).toBe('welcome');
      expect(store.peekTracksCount()).toBe(3);
      expect(audio.calls).toEqual([]);
      expect(api.calls).toEqual(['today']);
    });

    it('propose la reprise avec ce qui est déjà répondu, toujours sans son', async () => {
      api.today = TODAY({ state: 'resumable', completedCount: 2 });

      await store.init();

      expect(store.screen()).toBe('resume_prompt');
      expect(store.peekCompletedCount()).toBe(2);
      expect(audio.calls).toEqual([]);
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
      expect(api.calls).not.toContain('stats');
    });

    it('sans défi : écran « pas de défi » ; échec réseau : écran d\'erreur', async () => {
      api.today = TODAY({ state: 'no_challenge', tracksCount: 0 });
      await store.init();
      expect(store.screen()).toBe('no_challenge');

      api.today = new Error('réseau');
      await store.init();
      expect(store.screen()).toBe('error');
    });

    it('« Réessayer » sans défi tente le démarrage, qui génère le défi à la volée', async () => {
      api.today = TODAY({ state: 'no_challenge', tracksCount: 0 });
      await store.init();

      await store.retryNoChallenge();

      // Le serveur a régénéré le défi au démarrage : on est dans la partie.
      expect(api.calls.slice(-2)).toEqual(['settings', 'start']);
      expect(store.screen()).toBe('playing');
    });

    it("« Réessayer » ne démarre rien si le défi est revenu entre-temps : l'accueil", async () => {
      api.today = TODAY({ state: 'no_challenge', tracksCount: 0 });
      await store.init();
      api.today = TODAY();

      await store.retryNoChallenge();

      expect(store.screen()).toBe('welcome');
      expect(api.calls).not.toContain('start');
    });

    it('« Réessayer » avec un pool insuffisant ramène sur « pas de défi »', async () => {
      api.today = TODAY({ state: 'no_challenge', tracksCount: 0 });
      api.start = { kind: 'no_challenge' };
      await store.init();

      await store.retryNoChallenge();

      expect(store.screen()).toBe('no_challenge');
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

  describe('« Commencer » et « Reprendre »', () => {
    it("crée l'identité, lit les réglages, démarre la partie et lance le premier morceau au clic", async () => {
      await store.init();
      const begun = store.begin();
      // Le son est déverrouillé dans le clic même, avant tout appel réseau (iPhone).
      expect(audio.calls).toEqual(['unlock']);
      await begun;

      expect(guestCreated).toBe(1);
      expect(store.screen()).toBe('playing');
      expect(store.sessionId()).toBe(11);
      expect(store.position()).toBe(1);
      expect(round.phase()).toBe('loading');
      expect(audio.calls).toEqual(['unlock', 'stop', 'load https://cdn.example/1.mp3 next https://cdn.example/2.mp3', 'playUntil 0.5']);
    });

    it('une reprise relit les réponses, le plancher d\'écoute et les indices du morceau en cours (piège 35)', async () => {
      api.start = {
        kind: 'ok',
        session: SESSION({
          isResuming: true,
          nextPosition: 2,
          completedAnswers: [ANSWERED(1, { score: 700 })],
          currentTrack: { position: 2, listenedSeconds: 2, hintLevel: 1, hintFacts: [{ kind: 'year', value: '1999' }] },
        }),
      };

      await store.init();
      await store.begin();

      expect(store.position()).toBe(2);
      expect(store.totalScore()).toBe(700);
      // Les paliers sous les 2 s déjà écoutées ne sont plus proposés.
      expect(round.steps()).toEqual([2, 5]);
      expect(round.hintLevel()).toBe(1);
      expect(round.hints()).toEqual([{ kind: 'year', value: '1999' }]);
    });

    it("une partie déjà finie ou abandonnée ailleurs mène à « déjà joué »", async () => {
      api.start = { kind: 'already_played', abandoned: true };
      await store.init();
      await store.begin();

      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(true);
    });

    it('pool insuffisant : « pas de défi » ; échec : erreur', async () => {
      api.start = { kind: 'no_challenge' };
      await store.begin();
      expect(store.screen()).toBe('no_challenge');

      api.start = { kind: 'error' };
      await store.begin();
      expect(store.screen()).toBe('error');
    });

    it('des réglages illisibles mènent à l\'erreur sans démarrer de partie', async () => {
      api.settings = new Error('500');

      await store.begin();

      expect(store.screen()).toBe('error');
      expect(api.calls).not.toContain('start');
    });
  });

  describe('une manche', () => {
    it("envoie chaque palier choisi au serveur, une seule fois (c'est ce qui débloque les indices)", async () => {
      await startGame();
      TestBed.tick();
      await flush();
      expect(api.calls).toContain('listening 11/1/0.5');

      round.listenMore();
      TestBed.tick();
      await flush();
      expect(api.calls.filter(c => c.startsWith('listening'))).toEqual(['listening 11/1/0.5', 'listening 11/1/1']);
    });

    it("enregistre la réponse, la révèle et additionne les points", async () => {
      await startGame();
      round.submit({ artist: 'A', title: 'T' });

      await store.submit(submissionOf(1));

      expect(api.calls).toContain('answer 11/1/1');
      expect(round.phase()).toBe('revealed');
      expect(store.totalScore()).toBe(850);
      expect(store.roundScore()).toBe(850);
      expect(store.roundResult()?.correctArtist).toBe('Artiste 1');
      expect(store.roundDeezerTrackId()).toBe(101);
    });

    it("sur un échec d'envoi, rien n'est enregistré : le joueur reste sur le morceau avec « Réessayer » (piège 32)", async () => {
      await startGame();
      api.answer = () => new Error('503');
      round.submit({ artist: 'A', title: 'T' });

      await store.submit(submissionOf(1));

      expect(round.phase()).toBe('submit-error');
      expect(store.results()).toEqual([]);
      expect(store.totalScore()).toBe(0);
    });

    it('« Piste suivante » lance le morceau suivant, en arrière-plan celui d\'après', async () => {
      await startGame();
      await store.submit(submissionOf(1));
      audio.calls.length = 0;

      store.nextTrack();

      expect(store.position()).toBe(2);
      expect(store.isLastTrack()).toBe(false);
      expect(audio.calls).toEqual(['unlock', 'stop', 'load https://cdn.example/2.mp3 next https://cdn.example/3.mp3', 'playUntil 0.5']);
    });

    it('après le dernier morceau : récap, statistiques du jour et série relues', async () => {
      await startGame();
      for (const position of [1, 2, 3]) {
        await store.submit(submissionOf(position));
        store.nextTrack();
      }
      await flush();

      expect(store.screen()).toBe('done');
      expect(store.canShare()).toBe(true);
      expect(api.calls).toContain('stats');
      expect(api.calls.filter(c => c === 'today')).toHaveLength(2);
    });

    it('un indice attend le palier envoyé, puis s\'affiche', async () => {
      await startGame();
      TestBed.tick();
      round.listenMore();
      TestBed.tick();

      await store.requestHint(1);

      const calls = api.calls.filter(c => c.startsWith('listening') || c.startsWith('hint'));
      expect(calls.at(-1)).toBe('hint 11/1/1');
      expect(calls.indexOf('hint 11/1/1')).toBeGreaterThan(calls.indexOf('listening 11/1/1'));
      expect(round.hints()).toEqual([{ kind: 'year', value: '2013' }]);
      expect(store.hintPending()).toBe(false);
    });
  });

  describe('abandon', () => {
    it('en cours de partie : la partie est abandonnée et le son coupé', async () => {
      await startGame();

      await store.abandon();

      expect(api.calls).toContain('abandon 11');
      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(true);
      expect(store.abandonLoading()).toBe(false);
      expect(round.phase()).toBeNull();
    });

    it("depuis l'écran de reprise : retrouve la partie, puis l'abandonne", async () => {
      api.today = TODAY({ state: 'resumable', completedCount: 1 });
      await store.init();

      await store.abandonFromResume();

      expect(api.calls.slice(-2)).toEqual(['start', 'abandon 11']);
      expect(store.screen()).toBe('already_played');
      expect(store.abandoned()).toBe(true);
    });
  });

  describe('retour de l\'onglet au premier plan (plusieurs onglets)', () => {
    it("une partie finie ailleurs pendant qu'on joue mène à « déjà joué »", async () => {
      await startGame();
      api.today = TODAY({ state: 'already_played' });

      store.refresh();
      await flush();

      expect(store.screen()).toBe('already_played');
      expect(round.phase()).toBeNull();
    });

    it("pendant la révélation du dernier morceau, le retour de l'onglet ne saute pas le récap", async () => {
      await startGame();
      for (const position of [1, 2]) {
        await store.submit(submissionOf(position));
        store.nextTrack();
      }
      await store.submit(submissionOf(3));
      api.today = TODAY({ state: 'already_played' });

      store.refresh();
      await flush();

      expect(store.screen()).toBe('playing');
    });

    it("jamais de retour à l'accueil ni à la reprise pendant la partie", async () => {
      await startGame();
      api.today = TODAY({ state: 'resumable' });

      store.refresh();
      await flush();

      expect(store.screen()).toBe('playing');
    });

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

  describe('série et toasts', () => {
    const lost: Streak = { ...EMPTY_STREAK, lostStreak: 9, lastPlayedDate: '2026-10-01' };

    it('un invité apprend sa série perdue une seule fois par série perdue', async () => {
      api.today = TODAY({ streak: lost });
      await store.init();
      expect(store.showLostToast()).toBe(true);
      expect(store.lostStreak()).toBe(9);

      store.dismissLostToast();
      expect(store.showLostToast()).toBe(false);

      // Même série perdue au chargement suivant : déjà annoncée, elle ne revient pas.
      await store.init();
      expect(store.lostStreak()).toBeNull();
    });

    it("un compte ne voit jamais le toast « série perdue »", async () => {
      TestBed.inject(SessionStore).signedIn({ id: 'p', pseudo: 'Alice', email: 'a@b.fr', isGuest: false, isAdmin: false });
      api.today = TODAY({ streak: lost });

      await store.init();

      expect(store.showLostToast()).toBe(false);
    });

    it('un compte voit « +1 gel gagné » sur le récap quand la partie du jour en a gagné un, jusqu\'à sa fermeture', async () => {
      TestBed.inject(SessionStore).signedIn({ id: 'p', pseudo: 'Alice', email: 'a@b.fr', isGuest: false, isAdmin: false });
      api.today = TODAY({ state: 'already_played' });
      api.stats = STATS({ freezeMilestone: true });

      await store.init();
      await flush();
      expect(store.toasts().gelEarned).toBe(true);

      store.dismissGelToast();
      expect(store.toasts().gelEarned).toBe(false);
    });

    it("un invité voit sa série non sauvegardée sur le récap, avec la série des statistiques du jour", async () => {
      api.today = TODAY({ state: 'already_played' });
      api.stats = STATS({ currentStreak: 5 });

      await store.init();
      await flush();

      expect(store.toasts().guestStreak).toBe(true);
      expect(store.toastStreak()).toBe(5);
      expect(store.toastStreakKey()).toBe('other');
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

import { TestBed } from '@angular/core/testing';
import { SessionLoader } from '../../account/data-access/session-loader';
import { FakeAudioPort, provideFakeAudio } from '../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../gameplay/data-access/testing/fake-waveform.port';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RoundSubmission } from '../../gameplay/domain/track-round';
import { DailyRoundStore } from './daily-round.store';
import { HomeStore } from './home.store';
import { ANSWERED, FakeDailyApi, SESSION, TODAY, provideFakeDailyApi } from './testing/fake-daily-api';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('DailyRoundStore', () => {
  let api: FakeDailyApi;
  let audio: FakeAudioPort;
  let guestCreated: number;
  let store: InstanceType<typeof DailyRoundStore>;
  let home: InstanceType<typeof HomeStore>;
  let round: InstanceType<typeof TrackRoundStore>;

  beforeEach(() => {
    api = new FakeDailyApi();
    audio = new FakeAudioPort();
    guestCreated = 0;
    TestBed.configureTestingModule({
      providers: [
        provideFakeDailyApi(api),
        provideFakeAudio(audio),
        provideFakeWaveform(new FakeWaveformPort()),
        { provide: SessionLoader, useValue: { ensureGuest: async () => { guestCreated++; } } },
        TrackRoundStore,
        HomeStore,
        DailyRoundStore,
      ],
    });
    store = TestBed.inject(DailyRoundStore);
    home = TestBed.inject(HomeStore);
    round = TestBed.inject(TrackRoundStore);
  });

  const submissionOf = (position: number, seconds = 1): RoundSubmission =>
    ({ trackId: position, listenedSeconds: seconds, wasExtended: false, artist: 'A', title: 'T' });

  /** L'accueil lit l'état du jour, puis le clic ouvre la manche, qui crée la partie ; le lecteur annonce son extrait prêt. */
  async function startGame(): Promise<void> {
    await home.init();
    await store.begin();
    audio.emit('ready');
    TestBed.tick();
  }

  /** Répond aux trois morceaux et enchaîne jusqu'au résultat. */
  async function playAll(): Promise<void> {
    for (const position of [1, 2, 3]) {
      await store.submit(submissionOf(position));
      store.nextTrack();
    }
    await flush();
  }

  describe('arrivée sur la manche', () => {
    it("un retour à l'accueil pendant l'ouverture ne crée aucune partie et ne lance aucun son", async () => {
      await home.init();
      api.calls.length = 0;

      const pending = store.begin();
      store.dispose();
      const exit = await pending;

      expect(exit).toBe('home');
      expect(audio.calls).not.toContain('playUntil 0.5');
      expect(api.calls).not.toContain('start');
    });

    it("crée l'identité, lit les réglages, démarre la partie et lance le premier morceau, sans rien relire de l'état du jour", async () => {
      await home.init();
      api.calls.length = 0;

      await store.begin();

      expect(guestCreated).toBe(1);
      expect(api.calls).toEqual(['settings', 'start']);
      expect(store.phase()).toBe('playing');
      expect(store.sessionId()).toBe(11);
      expect(store.position()).toBe(1);
      expect(round.phase()).toBe('loading');
      expect(audio.calls).toEqual(['unlock', 'stop', 'load https://cdn.example/1.mp3 next https://cdn.example/2.mp3', 'playUntil 0.5']);
    });

    it("la partie lancée rend l'état lu par l'accueil périmé et lui donne la série du serveur", async () => {
      await home.init();

      await store.begin();

      expect(home.stale()).toBe(true);
    });

    it('une reprise relit les réponses, le plancher d\'écoute et les indices du morceau en cours (piège 35)', async () => {
      api.start = {
        kind: 'ok',
        session: SESSION({
          isResuming: true,
          nextPosition: 2,
          completedAnswers: [ANSWERED(1, { score: 700 })],
          currentTrack: { position: 2, listenedSeconds: 2, hintLevel: 1, hintFacts: [{ kind: 'year', value: '1999' }], failedAttempts: 0 },
        }),
      };

      await home.init();
      await store.begin();

      expect(store.position()).toBe(2);
      expect(store.totalScore()).toBe(700);
      // Les paliers sous les 2 s déjà écoutées ne sont plus proposés.
      expect(round.steps()).toEqual([2, 5]);
      expect(round.hintLevel()).toBe(1);
      expect(round.hints()).toEqual([{ kind: 'year', value: '1999' }]);
    });

    it("une partie déjà finie ou abandonnée ailleurs : la manche rend la main, l'accueil dit « déjà joué »", async () => {
      api.start = { kind: 'already_played', abandoned: true };
      await home.init();

      const exit = await store.begin();
      await flush();

      expect(exit).toBe('home');
      expect(home.screen()).toBe('already_played');
      expect(home.abandoned()).toBe(true);
      expect(store.isPlaying()).toBe(false);
      home.stopCountdown();
    });

    it("pool insuffisant : l'accueil dit « pas de défi » ; échec : erreur", async () => {
      api.start = { kind: 'no_challenge' };
      expect(await store.begin()).toBe('home');
      expect(home.screen()).toBe('no_challenge');

      api.start = { kind: 'error' };
      expect(await store.begin()).toBe('home');
      expect(home.screen()).toBe('error');
    });

    it("des réglages illisibles mènent à l'erreur sans démarrer de partie", async () => {
      api.settings = new Error('500');

      expect(await store.begin()).toBe('home');

      expect(home.screen()).toBe('error');
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

    it("une seconde tentative offerte ne compte rien et ne révèle rien : la saisie revient, au même palier, au prix réduit (piège 51)", async () => {
      await startGame();
      audio.emit('finished');
      TestBed.tick();
      api.retriesToOffer = 1;
      round.listenMore();
      expect(round.stake()).toBe(850);
      round.submit({ artist: 'A', title: 'T' });

      await store.submit(submissionOf(1));

      expect(round.phase()).toBe('listened');
      expect(round.isRetry()).toBe(true);
      expect(round.retryOffers()).toBe(1);
      expect(store.results()).toEqual([]);
      expect(round.stake()).toBe(595);
      expect(round.chosenSeconds()).toBe(1);
    });

    it("la seconde réponse est définitive : elle est corrigée et révélée, jamais une troisième tentative", async () => {
      await startGame();
      audio.emit('finished');
      TestBed.tick();
      api.retriesToOffer = 1;
      round.submit({ artist: 'A', title: 'T' });
      await store.submit(submissionOf(1));

      round.submit({ artist: 'B', title: 'U' });
      await store.submit(submissionOf(1));

      expect(round.phase()).toBe('revealed');
      expect(store.results()).toHaveLength(1);
    });

    it("une reprise au milieu de la seconde tentative la garde (les points en jeu sont réduits)", async () => {
      api.start = {
        kind: 'ok',
        session: SESSION({
          isResuming: true,
          nextPosition: 1,
          currentTrack: { position: 1, listenedSeconds: 1, hintLevel: 0, hintFacts: [], failedAttempts: 1 },
        }),
      };

      await startGame();

      expect(round.isRetry()).toBe(true);
      expect(round.retryOffers()).toBe(0);
      expect(round.stake()).toBe(595);
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

    it('un extrait illisible redemande seul une adresse fraîche en reprenant la partie (piège 14)', async () => {
      await startGame();
      api.start = { kind: 'ok', session: SESSION({ isResuming: true, tracks: [1, 2, 3].map(position => ({ position, previewUrl: `https://cdn.example/${position}-frais.mp3` })) }) };
      audio.calls.length = 0;

      audio.emit('error');
      TestBed.tick();
      await flush();

      expect(api.calls.filter(c => c === 'start')).toHaveLength(2);
      expect(audio.calls).toContain('load https://cdn.example/1-frais.mp3 next https://cdn.example/2.mp3');
      expect(round.phase()).toBe('loading');
    });

    it('un morceau dont Deezer a retiré l\'extrait en cours de journée passe en « aperçu non disponible », sans relancer l\'adresse morte', async () => {
      await startGame();
      api.start = { kind: 'ok', session: SESSION({ isResuming: true, tracks: [{ position: 1, previewUrl: '' }, { position: 2, previewUrl: 'https://cdn.example/2.mp3' }] }) };
      audio.calls.length = 0;

      audio.emit('error');
      TestBed.tick();
      await flush();

      expect(round.phase()).toBe('no-preview');
      expect(audio.calls.some(c => c.startsWith('load'))).toBe(false);
      expect(round.skipUnplayable()).toMatchObject({ trackId: 1, artist: null, title: null });
    });

    it('une partie qui ne se reprend plus pendant la redemande garde l\'adresse (échec, pas « plus d\'extrait »)', async () => {
      await startGame();
      api.start = { kind: 'already_played', abandoned: false };
      audio.calls.length = 0;

      audio.emit('error');
      TestBed.tick();
      await flush();

      expect(audio.calls).toContain('load https://cdn.example/1.mp3 next https://cdn.example/2.mp3');
      expect(round.phase()).toBe('loading');
    });

    it('« Piste suivante » lance le morceau suivant, en arrière-plan celui d\'après', async () => {
      await startGame();
      await store.submit(submissionOf(1));
      audio.calls.length = 0;

      expect(store.nextTrack()).toBe('playing');

      expect(store.position()).toBe(2);
      expect(store.isLastTrack()).toBe(false);
      expect(audio.calls).toEqual(['unlock', 'stop', 'load https://cdn.example/2.mp3 next https://cdn.example/3.mp3', 'playUntil 0.5']);
    });

    it("après le dernier morceau : la manche rend la main, le résultat se lit sur l'accueil avec les statistiques et la série relues", async () => {
      await startGame();
      for (const position of [1, 2]) {
        await store.submit(submissionOf(position));
        store.nextTrack();
      }
      await store.submit(submissionOf(3));

      expect(store.nextTrack()).toBe('home');
      await flush();

      expect(store.isPlaying()).toBe(false);
      expect(round.phase()).toBeNull();
      expect(home.screen()).toBe('done');
      expect(home.canShare()).toBe(true);
      expect(home.totalScore()).toBe(2550);
      expect(home.stale()).toBe(false);
      expect(api.calls).toContain('stats');
      // L'état du jour de l'accueil, puis la série relue après la dernière réponse.
      expect(api.calls.filter(c => c === 'today')).toHaveLength(2);
      home.stopCountdown();
    });

    it("compte la partie qui vient de finir avant que l'état du jour ne la compte", async () => {
      api.today = TODAY({ completedGames: 3 });
      await startGame();
      api.today = TODAY({ state: 'already_played', completedGames: 4 });
      await playAll();

      expect(home.screen()).toBe('done');
      expect(home.gamesPlayed()).toBe(4);
      home.stopCountdown();
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
    it("en cours de partie : la partie est abandonnée, le son coupé, l'accueil dit « déjà joué »", async () => {
      await startGame();

      expect(await store.abandon()).toBe(true);
      await flush();

      expect(api.calls).toContain('abandon 11');
      expect(home.screen()).toBe('already_played');
      expect(home.abandoned()).toBe(true);
      expect(store.abandonLoading()).toBe(false);
      expect(store.isPlaying()).toBe(false);
      expect(round.phase()).toBeNull();
      home.stopCountdown();
    });

    it("un échec d'abandon laisse la partie en cours", async () => {
      await startGame();
      api.abandonError = true;

      expect(await store.abandon()).toBe(false);

      expect(store.isPlaying()).toBe(true);
      expect(home.screen()).not.toBe('already_played');
    });
  });

  describe('retour de l\'onglet au premier plan en pleine partie', () => {
    it("une partie finie ailleurs pendant qu'on joue arrête la manche : l'accueil dit « déjà joué »", async () => {
      await startGame();
      api.today = TODAY({ state: 'already_played' });

      const exit = await store.refresh();
      await flush();

      expect(exit).toBe('home');
      expect(home.screen()).toBe('already_played');
      expect(round.phase()).toBeNull();
      home.stopCountdown();
    });

    it("pendant la révélation du dernier morceau, le retour de l'onglet ne saute pas le récap", async () => {
      await startGame();
      for (const position of [1, 2]) {
        await store.submit(submissionOf(position));
        store.nextTrack();
      }
      await store.submit(submissionOf(3));
      api.today = TODAY({ state: 'already_played' });

      expect(await store.refresh()).toBe('playing');

      expect(store.isPlaying()).toBe(true);
    });

    it("jamais de retour à l'accueil ni à la reprise pendant la partie", async () => {
      await startGame();
      api.today = TODAY({ state: 'resumable' });

      expect(await store.refresh()).toBe('playing');

      expect(store.isPlaying()).toBe(true);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { FakeAudioPort, provideFakeAudio } from '../../gameplay/data-access/testing/fake-audio.port';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RunRoundSummary } from '../domain/run';
import { RunGameStore } from './run-game.store';
import { CURRENT, FakeRunsApi, ME, PLAY, ROUND, SESSION, TRACK, provideFakeRunsApi } from './testing/fake-runs-api';

describe('RunGameStore', () => {
  let api: FakeRunsApi;
  let audio: FakeAudioPort;
  let store: InstanceType<typeof RunGameStore>;
  let round: InstanceType<typeof TrackRoundStore>;

  beforeEach(() => {
    api = new FakeRunsApi();
    audio = new FakeAudioPort();
    TestBed.configureTestingModule({ providers: [provideFakeRunsApi(api), provideFakeAudio(audio), TrackRoundStore, RunGameStore] });
    store = TestBed.inject(RunGameStore);
    round = TestBed.inject(TrackRoundStore);
  });

  /** Le joueur valide sa saisie : la manche rend la réponse à envoyer, le store l'envoie. */
  async function send(): Promise<void> {
    const sent = round.submit({ artist: 'Daft Punk', title: 'One More Time' });
    if (sent) await store.submit(sent);
  }

  const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
    round: 1, passed: true, score: 320, objective: 200, tracks: [TRACK(), TRACK({ position: 2 })], totalScore: 320, ...overrides,
  });

  /** Lance la partie et laisse le lecteur annoncer son extrait prêt. */
  async function startRun(): Promise<void> {
    await store.init();
    await store.begin();
    audio.emit('ready');
    TestBed.tick();
  }

  describe('arrivée sur la page', () => {
    it("montre l'accueil sans lancer aucun son (il faut un clic)", async () => {
      await store.init();

      expect(store.screen()).toBe('welcome');
      expect(api.calls).toEqual(['me']);
      expect(audio.calls).toEqual(['stop']);
    });

    it('sans accès sur invitation, dit que le mode est réservé', async () => {
      api.meResult = ME({ hasAccess: false });

      await store.init();

      expect(store.screen()).toBe('access_denied');
    });

    it("une erreur de lecture de l'accès affiche l'erreur", async () => {
      api.meResult = new Error('réseau');

      await store.init();

      expect(store.screen()).toBe('error');
    });

    it('propose de reprendre une partie en cours', async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' }, record: { bestScore: 900, bestRoundsPassed: 2, isNew: false } });

      await store.init();

      expect(store.hasPending()).toBe(true);
      expect(store.record()?.bestScore).toBe(900);
    });
  });

  describe('lancer ou reprendre', () => {
    it('déverrouille le son dans le clic, avant tout appel réseau, puis lance le premier morceau à la durée fixe', async () => {
      await store.init();
      const begin = store.begin();

      // Avant tout `await` : le geste du clic est encore là.
      expect(audio.calls).toContain('unlock');
      await begin;

      expect(api.calls).toEqual(['me', 'launch']);
      expect(store.screen()).toBe('playing');
      expect(audio.calls).toEqual(expect.arrayContaining(['unlock', 'load https://cdn/preview-1.mp3', 'playUntil 10']));
      expect(round.steps()).toEqual([10]);
      expect(round.phase()).toBe('loading');
    });

    it('reprend la partie en cours au lieu d\'en lancer une autre', async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      await store.init();

      await store.begin();

      expect(api.calls).toEqual(['me', 'join:ABC234']);
      expect(store.screen()).toBe('playing');
    });

    it('un refus d\'accès au lancement montre l\'écran réservé', async () => {
      api.launchResult = { kind: 'access_denied' };
      await store.init();

      await store.begin();

      expect(store.screen()).toBe('access_denied');
    });

    it('sans playlist possible, le dit', async () => {
      api.launchResult = { kind: 'no_challenge' };
      await store.init();

      await store.begin();

      expect(store.screen()).toBe('no_challenge');
    });

    it('une partie déjà finie ailleurs ramène à l\'accueil', async () => {
      api.launchResult = { kind: 'already_played', abandoned: false };
      await store.init();

      await store.begin();

      expect(store.screen()).toBe('welcome');
    });

    it('une erreur de lancement affiche l\'erreur', async () => {
      api.launchResult = { kind: 'error' };
      await store.init();

      await store.begin();

      expect(store.screen()).toBe('error');
    });

    it('pas d\'indice, pas de « écouter plus » : un seul palier', async () => {
      await startRun();

      expect(round.maxStep()).toBe(10);
      expect(round.nextStep()).toBeNull();
      expect(round.availableHintLevels()).toEqual([]);
    });
  });

  describe('un morceau', () => {
    beforeEach(async () => {
      await startRun();
    });

    it("montre la manche, le score total, l'objectif et les pastilles du morceau en cours", () => {
      expect(store.shownRound()).toEqual(ROUND());
      expect(store.rounds()).toBe(4);
      expect(store.totalScore()).toBe(0);
      expect(store.pills()).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
      expect(store.positionInRound()).toBe(1);
      expect(store.answered()).toBe(false);
    });

    it('envoie la réponse par la position du morceau, puis révèle : la carte de réponse remplace le lecteur', async () => {
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()] }),
        revealed: TRACK({ points: 100 }),
        current: CURRENT({ position: 2, positionInRound: 2 }),
      });

      await send();

      expect(api.answers).toEqual([{ position: 1, artist: 'Daft Punk', title: 'One More Time' }]);
      expect(store.answered()).toBe(true);
      expect(store.revealed()?.points).toBe(100);
      expect(store.gain()).toBe(100);
      expect(store.totalScore()).toBe(100);
      expect(store.pills()).toEqual(['found', 'todo', 'todo', 'todo', 'todo']);
      expect(store.positionInRound()).toBe(1);
      expect(round.phase()).toBe('revealed');
      expect(audio.calls).toContain('playFull');
    });

    it('« Morceau suivant » lance le morceau suivant dans le clic', async () => {
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()] }),
        revealed: TRACK(),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
      });
      await send();
      audio.calls.length = 0;

      store.nextTrack();

      expect(audio.calls[0]).toBe('unlock');
      expect(audio.calls).toContain('load https://cdn/preview-2.mp3');
      expect(store.answered()).toBe(false);
      expect(store.pills()).toEqual(['found', 'current', 'todo', 'todo', 'todo']);
      expect(store.positionInRound()).toBe(2);
      expect(round.trackId()).toBe(2);
    });

    it('un échec d\'envoi garde le morceau, avec « Réessayer » : rien n\'est affiché comme répondu', async () => {
      api.answerResult = new Error('réseau');

      await send();

      expect(store.answered()).toBe(false);
      expect(round.phase()).toBe('submit-error');
      expect(store.totalScore()).toBe(0);
    });
  });

  describe('fin de manche', () => {
    const lastOfRound = () => PLAY({
      session: SESSION({ totalScore: 320, round: ROUND({ round: 2, score: 0, objective: 250, maxScore: 500 }), roundsPassed: 1, roundTracks: [] }),
      revealed: TRACK({ position: 5, points: 100 }),
      roundSummaries: [summary()],
      current: CURRENT({ position: 6, round: 2, positionInRound: 1, previewUrl: 'https://cdn/preview-6.mp3' }),
    });

    beforeEach(async () => {
      await startRun();
    });

    it('après la dernière réponse de la manche, la barre garde cette manche (score et objectif du bilan), pas la suivante', async () => {
      api.answerResult = lastOfRound();

      await send();

      expect(store.shownRound()).toEqual({ round: 1, score: 320, objective: 200, maxScore: 500 });
      expect(store.shownTracks()).toHaveLength(2);
      expect(store.pills()).toEqual(['found', 'found', 'todo', 'todo', 'todo']);
    });

    it('« Morceau suivant » mène au bilan de la manche, sans lancer de son', async () => {
      api.answerResult = lastOfRound();
      await send();
      audio.calls.length = 0;

      store.nextTrack();

      expect(store.screen()).toBe('round_end');
      expect(store.summaries()[0].round).toBe(1);
      expect(audio.calls.some(c => c.startsWith('load'))).toBe(false);
    });

    it('« Manche suivante » lance le premier morceau de la manche débloquée, dans le clic', async () => {
      api.answerResult = lastOfRound();
      await send();
      store.nextTrack();
      audio.calls.length = 0;

      store.nextRound();

      expect(audio.calls[0]).toBe('unlock');
      expect(audio.calls).toContain('load https://cdn/preview-6.mp3');
      expect(store.screen()).toBe('playing');
      expect(store.shownRound()?.round).toBe(2);
      expect(store.summaries()).toEqual([]);
      expect(store.pills()).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
    });
  });

  describe('fin de partie', () => {
    const finish = (status: 'won' | 'lost') => ({
      status, disc: { key: 'runs.discs.gold', stars: 0 }, totalScore: 2500, roundsPassed: 4, foundCount: 18, trackCount: 20,
      tracks: [], rounds: [], record: { bestScore: 2500, bestRoundsPassed: 4, isNew: true }, challengeCode: 'ABC234',
    });

    beforeEach(async () => {
      await startRun();
    });

    it('la dernière réponse montre d\'abord sa carte ; « Morceau suivant » mène à la fin', async () => {
      api.answerResult = PLAY({
        session: SESSION({ status: 'won', totalScore: 2500, round: null, finish: finish('won') }),
        revealed: TRACK({ position: 20 }),
        roundSummaries: [summary({ round: 4 })],
        current: null,
      });
      await send();

      expect(store.screen()).toBe('playing');
      expect(store.answered()).toBe(true);

      store.nextTrack();

      expect(store.screen()).toBe('finished');
      expect(store.finish()?.disc.key).toBe('runs.discs.gold');
      expect(store.answered()).toBe(false);
    });

    it('une manche ratée finit la partie : « Morceau suivant » mène à la fin, pas au bilan', async () => {
      api.answerResult = PLAY({
        session: SESSION({ status: 'lost', round: null, finish: finish('lost') }),
        revealed: TRACK({ position: 5 }),
        roundSummaries: [summary({ passed: false })],
        current: null,
      });
      await send();

      store.nextTrack();

      expect(store.screen()).toBe('finished');
    });

    it('« Nouvelle partie » revient à l\'accueil, le record relu', async () => {
      api.answerResult = PLAY({ session: SESSION({ status: 'won', round: null, finish: finish('won') }), revealed: TRACK(), current: null });
      await send();
      store.nextTrack();
      api.meResult = ME({ record: { bestScore: 2500, bestRoundsPassed: 4, isNew: false } });

      await store.playAgain();

      expect(store.screen()).toBe('welcome');
      expect(store.record()?.bestScore).toBe(2500);
    });
  });

  describe('abandon', () => {
    beforeEach(async () => {
      await startRun();
    });

    it('ferme la partie côté serveur, coupe le son et revient à l\'accueil', async () => {
      await store.abandon();

      expect(api.calls).toContain('abandon:7');
      expect(store.screen()).toBe('welcome');
      expect(store.abandonLoading()).toBe(false);
      expect(audio.calls.at(-1)).toBe('stop');
    });

    it('un échec laisse la partie en cours', async () => {
      api.abandonError = new Error('réseau');

      await store.abandon();

      expect(store.screen()).toBe('playing');
      expect(store.abandonLoading()).toBe(false);
    });
  });

  describe('extrait redemandé', () => {
    beforeEach(async () => {
      await startRun();
    });

    it('un premier échec de lecture redemande l\'extrait du morceau en cours et le relance', async () => {
      api.refreshResult = PLAY({ current: CURRENT({ previewUrl: 'https://cdn/preview-1-frais.mp3' }) });

      audio.emit('error');
      TestBed.tick();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(api.calls).toContain('refreshPreview:7');
      expect(audio.calls).toContain('load https://cdn/preview-1-frais.mp3');
    });

    it('si le serveur a neutralisé le morceau en route, l\'écran suit la nouvelle situation', async () => {
      api.refreshResult = PLAY({
        session: SESSION({ round: ROUND({ objective: 160 }) }),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
        neutralized: [{ position: 1, round: 1, objectiveBefore: 200, objectiveAfter: 160 }],
      });

      audio.emit('error');
      TestBed.tick();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(round.trackId()).toBe(2);
      expect(store.shownRound()?.objective).toBe(160);
      expect(store.neutralized()).toHaveLength(1);
    });
  });
});

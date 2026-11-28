import { TestBed } from '@angular/core/testing';
import { FakeAudioPort } from '../../gameplay/data-access/testing/fake-audio.port';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RunGameStore, RunScreen } from './run-game.store';
import { StartOutcome } from './runs.api';
import { CURRENT, FakeRunsApi, ME, PLAY, ROUND, SESSION, TRACK } from './testing/fake-runs-api';
import { setupRunGame } from './testing/run-game-harness';

describe("RunGameStore, cycle de la partie et de l'onglet", () => {
  const h = setupRunGame();
  let api: FakeRunsApi;
  let audio: FakeAudioPort;
  let store: InstanceType<typeof RunGameStore>;
  let round: InstanceType<typeof TrackRoundStore>;
  const { startRun } = h;

  beforeEach(() => {
    ({ api, audio, store, round } = h.current());
  });

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

    it("propose de reprendre une partie en cours (l'écran de reprise du Daily), avec les morceaux déjà joués", async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' }, record: { bestScore: 900, bestRoundsPassed: 2, isNew: false } });
      api.sessionResult = SESSION({ round: ROUND({ round: 2 }), roundTracks: [TRACK({ position: 6, round: 2 })] });

      await store.init();

      expect(store.screen()).toBe('resume');
      expect(api.calls).toEqual(['me', 'session:7']);
      expect(store.resumeCount()).toBe(1);
      expect(store.resumeTotal()).toBe(5);
      expect(store.record()?.bestScore).toBe(900);
      expect(audio.calls).toEqual(['stop']);
    });

    it("l'accès retiré n'empêche pas de reprendre la partie en cours", async () => {
      api.meResult = ME({ hasAccess: false, pending: { sessionId: 7, challengeCode: 'ABC234' } });

      await store.init();

      expect(store.screen()).toBe('resume');
    });

    it('abandonner depuis la reprise ferme la partie en cours et revient à l\'accueil', async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      await store.init();
      api.meResult = ME();

      await store.abandon();

      expect(api.calls).toContain('abandon:7');
      expect(store.screen()).toBe('welcome');
    });

    it("une erreur de lecture de la partie en cours affiche l'erreur", async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      api.sessionResult = new Error('réseau');

      await store.init();

      expect(store.screen()).toBe('error');
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

      expect(api.calls).toEqual(['me', 'session:7', 'join:ABC234']);
      expect(store.screen()).toBe('playing');
    });

    it.each<[string, StartOutcome, RunScreen]>([
      ["un refus d'accès au lancement passe à l'écran sans accès (la page renvoie au jeu du jour)", { kind: 'access_denied' }, 'access_denied'],
      ['sans playlist possible, le dit', { kind: 'no_challenge' }, 'no_challenge'],
      ["une partie déjà finie ailleurs ramène à l'accueil", { kind: 'already_played', abandoned: false }, 'welcome'],
      ["une erreur de lancement affiche l'erreur", { kind: 'error' }, 'error'],
    ])('%s', async (_name, outcome, screen) => {
      api.launchResult = outcome;
      await store.init();

      await store.begin();

      expect(store.screen()).toBe(screen);
    });

    it('la reprise rend la pile, le total et le morceau courant de la partie quittée', async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      api.joinResult = {
        kind: 'ok',
        play: PLAY({
          isResuming: true,
          session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()], playedTracks: [TRACK()] }),
          current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
        }),
      };
      await store.init();

      await store.begin();

      expect(store.screen()).toBe('playing');
      expect(store.pile()).toEqual([{ kind: 'track', track: TRACK(), past: false }]);
      expect(store.totalScore()).toBe(100);
      expect(round.trackId()).toBe(2);
    });

    it('pas de « écouter plus » : un seul palier', async () => {
      await startRun();

      expect(round.maxStep()).toBe(10);
      expect(round.nextStep()).toBeNull();
    });
  });

  describe('retour de l\'onglet au premier plan', () => {
    it('rien n\'a bougé ailleurs : la manche continue, sans rien relancer', async () => {
      await startRun();
      api.sessionResult = SESSION({ roundTracks: [], playedTracks: [] });
      audio.calls.length = 0;

      await store.refresh();

      expect(api.calls).toContain('session:7');
      expect(store.screen()).toBe('playing');
      expect(audio.calls).toEqual([]);
    });

    it('la partie a été finie dans un autre onglet : l\'écran de fin', async () => {
      await startRun();
      api.sessionResult = SESSION({
        status: 'lost', round: null, playedTracks: [1, 2, 3, 4, 5].map(position => TRACK({ position, artistCorrect: false, titleCorrect: false })),
        finish: {
          status: 'lost', totalScore: 0, roundsPassed: 0, foundCount: 0, trackCount: 20,
          tracks: [], rounds: [], record: null, challengeCode: 'ABC234', livesLeft: 0, lifeBonus: 0, completeBonus: 0, level: null,
        },
      });

      await store.refresh();

      expect(store.screen()).toBe('finished');
      expect(store.finish()?.status).toBe('lost');
    });

    it('la partie a été abandonnée dans un autre onglet : pas d\'écran de fin, l\'accueil du mode', async () => {
      await startRun();
      api.sessionResult = SESSION({ status: 'abandoned', round: null });
      api.meResult = ME();

      await store.refresh();

      expect(store.screen()).toBe('welcome');
    });

    it('la partie a avancé dans un autre onglet : l\'écran de reprise (le son repartira d\'un toucher)', async () => {
      await startRun();
      api.sessionResult = SESSION({ playedTracks: [TRACK({ position: 1 }), TRACK({ position: 2 })], roundTracks: [TRACK({ position: 1 }), TRACK({ position: 2 })] });
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      audio.calls.length = 0;

      await store.refresh();

      expect(store.screen()).toBe('resume');
      expect(audio.calls.filter(c => c.startsWith('load'))).toEqual([]);
    });

    it('une réponse en route pendant la relecture : c\'est cet onglet qui avance, la manche continue', async () => {
      await startRun();
      let answered: (play: ReturnType<typeof PLAY>) => void = () => undefined;
      vi.spyOn(api, 'submitAnswer').mockImplementation(() => new Promise(resolve => { answered = resolve; }));
      api.sessionResult = SESSION({ playedTracks: [TRACK({ position: 1 })], roundTracks: [TRACK({ position: 1 })] });
      const sent = round.submit({ artist: 'Daft Punk', title: 'One More Time' });
      const sending = sent ? store.submit(sent) : Promise.resolve();
      const callsBefore = api.calls.length;

      await store.refresh();
      answered(PLAY({ revealed: TRACK({ position: 1 }), current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }) }));
      await sending;

      expect(store.screen()).toBe('playing');
      // Ni relecture conclue ni reconstruction de l'écran (qui relirait `me`).
      expect(api.calls.slice(callsBefore)).not.toContain('me');
    });

    it('sur l\'accueil du mode, le record et l\'étagère se relisent quand rien d\'autre n\'a bougé', async () => {
      await store.init();
      api.meResult = ME({ record: { bestScore: 1200, bestRoundsPassed: 2, isNew: false } });

      await store.refresh();

      expect(store.screen()).toBe('welcome');
      expect(store.record()?.bestScore).toBe(1200);
    });

    it('sur l\'accueil du mode, une partie lancée dans un autre onglet propose de la reprendre', async () => {
      await store.init();
      expect(store.screen()).toBe('welcome');
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });

      await store.refresh();

      expect(store.screen()).toBe('resume');
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
      expect(audio.calls.at(-1)).toBe('stop');
    });

    it('un échec laisse la partie en cours', async () => {
      api.abandonError = new Error('réseau');

      await store.abandon();

      expect(store.screen()).toBe('playing');
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

    const refreshFails = async () => {
      audio.emit('error');
      TestBed.tick();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    };

    it('si le serveur a retiré le morceau en route, la carte « Morceau retiré » s\'affiche sans relancer de son', async () => {
      api.refreshResult = PLAY({
        session: SESSION({ roundTracks: [TRACK({ position: 1, neutralized: true, points: 0 })] }),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
        neutralized: [{ position: 1, round: 1 }],
      });
      audio.calls.length = 0;

      await refreshFails();

      expect(store.screen()).toBe('playing');
      expect(store.withdrawn()?.position).toBe(1);
      expect(round.trackId()).toBeNull();
      expect(audio.calls.some(c => c.startsWith('load'))).toBe(false);
    });

    it('« Morceau suivant » depuis la carte du retrait lance le morceau suivant dans le clic', async () => {
      api.refreshResult = PLAY({
        session: SESSION(),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
        neutralized: [{ position: 1, round: 1 }],
      });
      await refreshFails();
      audio.calls.length = 0;

      store.next();

      expect(audio.calls[0]).toBe('unlock');
      expect(audio.calls).toContain('load https://cdn/preview-2.mp3');
      expect(store.withdrawn()).toBeNull();
      expect(round.trackId()).toBe(2);
    });
  });
});

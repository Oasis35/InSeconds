import type { MockInstance } from 'vitest';
import { FakeAudioPort } from '../../gameplay/data-access/testing/fake-audio.port';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RunGameStore } from './run-game.store';
import { RunSounds } from './run-sounds';
import { CURRENT, FakeRunsApi, ME, PLAY, ROUND, SESSION, TRACK } from './testing/fake-runs-api';
import { setupRunGame } from './testing/run-game-harness';

describe('RunGameStore, une manche', () => {
  const h = setupRunGame();
  let api: FakeRunsApi;
  let audio: FakeAudioPort;
  let store: InstanceType<typeof RunGameStore>;
  let round: InstanceType<typeof TrackRoundStore>;
  let sounds: MockInstance<RunSounds['play']>;
  const { send, startRun, summary } = h;

  beforeEach(() => {
    ({ api, audio, store, round, sounds } = h.current());
  });

  describe('le choix du thème avant la manche', () => {
    const themeChoice = { round: 2, themes: [{ id: 1, name: 'Années 80', round: 2, icon: null }, { id: 2, name: 'Rap français', round: 2, icon: null }] };
    const waitingTheme = (overrides = {}) => SESSION({
      round: ROUND({ round: 2, score: 0, listenSeconds: 5 }), roundsPassed: 1, roundTracks: [], themeChoice,
      passedRounds: [{ round: 1, score: 320, listenSeconds: 10, theme: null }], ...overrides,
    });
    const afterTheme = () => PLAY({
      current: CURRENT({ position: 6, round: 2, positionInRound: 1, previewUrl: 'https://cdn/preview-6.mp3', listenSeconds: 5 }),
      session: waitingTheme({ themeChoice: null, themes: [{ round: 2, name: 'Rap français' }] }),
    });

    beforeEach(async () => {
      api.joinResult = { kind: 'ok', play: PLAY({ session: waitingTheme(), current: null, isResuming: true }) };
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      api.sessionResult = waitingTheme();
      await store.init();
      await store.begin();
    });

    it("une manche à thème en attente montre l'écran du choix, sans aucun extrait", () => {
      expect(store.screen()).toBe('theme');
      expect(store.themeScreen()!.choice.themes.map(t => t.name)).toEqual(['Années 80', 'Rap français']);
      expect(audio.calls.filter(c => c.startsWith('load') || c.startsWith('play'))).toEqual([]);
    });

    it("le choix part au serveur, l'écran garde la partie le temps de révéler le thème, puis le premier morceau est prêt mais ne part pas seul", async () => {
      api.chooseThemeResult = afterTheme();

      await store.chooseTheme(2);

      expect(api.calls).toContain('chooseTheme:7:2:2');
      expect(store.screen()).toBe('theme');
      expect(store.themeScreen()!.picked).toBe(2);
      expect(store.themeScreen()!.result).toBe('Rap français');

      store.continueFromTheme();

      expect(store.screen()).toBe('playing');
      expect(store.session()!.themes).toEqual([{ round: 2, name: 'Rap français' }]);
    });

    it('« Thème mystère » envoie un choix vide, que le serveur tire', async () => {
      api.chooseThemeResult = afterTheme();

      await store.chooseTheme(null);

      expect(api.calls).toContain('chooseTheme:7:2:mystery');
      expect(store.themeScreen()!.picked).toBe('mystery');
    });

    it('un second toucher ne renvoie rien', async () => {
      api.chooseThemeResult = afterTheme();
      const first = store.chooseTheme(1);
      await store.chooseTheme(2);
      await first;

      expect(api.calls.filter(c => c.startsWith('chooseTheme'))).toEqual(['chooseTheme:7:2:1']);
    });

    it('un choix refusé relit la partie', async () => {
      api.chooseThemeResult = new Error('refusé');

      await store.chooseTheme(1);

      expect(api.calls).toContain('me');
      expect(store.themeScreen()?.picked ?? null).toBeNull();
    });
  });

  describe('un morceau', () => {
    beforeEach(async () => {
      await startRun();
    });

    it("montre la manche, le total du run, une pile vide et le chrono plein tant que le son n'est pas sorti", () => {
      expect(store.shownRound()).toBe(1);
      expect(store.lives()).toEqual([true, true, true]);
      expect(store.totalScore()).toBe(0);
      expect(store.pile()).toEqual([]);
      expect(store.revealed()).toBeNull();
      expect(store.clockShown()).toBe(45);
      expect(store.clockLeft()).toBeNull();
    });

    it('envoie la réponse par la position du morceau, puis la révèle dans la carte ; la pile ne la prend qu\'au morceau suivant', async () => {
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()], playedTracks: [TRACK()] }),
        revealed: TRACK({ points: 100 }),
        current: CURRENT({ position: 2, positionInRound: 2 }),
      });

      await send();

      expect(api.answers).toEqual([{ position: 1, artist: 'Daft Punk', title: 'One More Time' }]);
      expect(store.revealed()?.points).toBe(100);
      expect(store.totalScore()).toBe(100);
      expect(store.pile()).toEqual([]);
      expect(round.phase()).toBe('revealed');
      expect(audio.calls).toContain('playFull');
    });

    it('« Morceau suivant » lance le morceau suivant dans le clic, et la réponse rejoint la pile avec sa forme', async () => {
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()], playedTracks: [TRACK()] }),
        revealed: TRACK(),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
      });
      await send();
      audio.calls.length = 0;

      store.next();

      expect(audio.calls[0]).toBe('unlock');
      expect(audio.calls).toContain('load https://cdn/preview-2.mp3');
      expect(store.revealed()).toBeNull();
      expect(store.pile()).toEqual([{ kind: 'track', track: TRACK(), past: false }]);
      expect(round.trackId()).toBe(2);
    });

    it('un échec d\'envoi garde le morceau, avec « Réessayer » : rien n\'est affiché comme répondu', async () => {
      api.answerResult = new Error('réseau');

      await send();

      expect(store.revealed()).toBeNull();
      expect(round.phase()).toBe('submit-error');
      expect(store.totalScore()).toBe(0);
    });
  });

  describe('fin de manche', () => {
    const passedRound = { round: 1, score: 320, listenSeconds: 10, theme: null };
    const lastOfRound = () => PLAY({
      session: SESSION({
        totalScore: 320, round: ROUND({ round: 2, score: 0, listenSeconds: 5 }), roundsPassed: 1, roundTracks: [],
        playedTracks: [TRACK(), TRACK({ position: 2, points: 100 })], passedRounds: [passedRound],
      }),
      // Une manche de deux morceaux : le second vient d'être répondu.
      revealed: TRACK({ position: 2, points: 100 }),
      roundSummaries: [summary()],
      current: CURRENT({ position: 6, round: 2, positionInRound: 1, previewUrl: 'https://cdn/preview-6.mp3', listenSeconds: 5 }),
    });

    beforeEach(async () => {
      await startRun();
    });

    it('après la dernière réponse de la manche, l\'en-tête garde cette manche, la pile attend', async () => {
      api.answerResult = lastOfRound();

      await send();

      expect(store.shownRound()).toBe(1);
      expect(store.pile()).toEqual([{ kind: 'track', track: TRACK(), past: false }]);
    });

    it('la réponse révélée, puis le bilan de la manche (sans son de manche tant qu\'il n\'est pas là), puis le morceau suivant', async () => {
      api.answerResult = lastOfRound();
      await send();
      expect(store.screen()).toBe('playing');
      expect(store.palier()).toBeNull();
      audio.calls.length = 0;

      store.next();

      expect(store.screen()).toBe('palier');
      expect(store.palier()).toMatchObject({ nextRound: 2, end: { round: 1, outcome: 'shorter', nextListenSeconds: 5 } });
      expect(sounds).toHaveBeenCalledWith('roundPassed');
      expect(audio.calls.filter(c => c.startsWith('load'))).toEqual([]);

      store.continueFromPalier();

      expect(audio.calls[0]).toBe('unlock');
      expect(audio.calls).toContain('load https://cdn/preview-6.mp3');
      expect(store.screen()).toBe('playing');
      expect(store.shownRound()).toBe(2);
      expect(store.pile().map(e => e.kind === 'track' ? `${e.track.position}${e.past ? '·' : ''}` : `[${e.passed.round}]`))
        .toEqual(['[1]', '2·', '1·']);
    });

    it('le bilan montre les vies qui restent', async () => {
      api.answerResult = PLAY({ ...lastOfRound(), roundSummaries: [summary({ livesLeft: 1 })], session: { ...lastOfRound().session, livesLeft: 1 } });
      await send();
      store.next();

      expect(store.palier()?.lives).toEqual([true, false, false]);
    });

    it('deux « Manche suivante » de suite ne lancent qu\'un seul morceau', async () => {
      api.answerResult = lastOfRound();
      await send();
      store.next();
      audio.calls.length = 0;

      store.continueFromPalier();
      store.continueFromPalier();

      expect(audio.calls.filter(c => c.startsWith('load'))).toHaveLength(1);
    });

    it('la manche suivante à thème : le bilan, puis l\'écran du choix, sans extrait', async () => {
      const themeChoice = { round: 2, themes: [{ id: 1, name: 'Années 80', round: 2, icon: null }, { id: 2, name: 'Rap français', round: 2, icon: null }] };
      api.answerResult = PLAY({ ...lastOfRound(), current: null, session: { ...lastOfRound().session, themeChoice } });
      await send();
      store.next();
      expect(store.screen()).toBe('palier');
      audio.calls.length = 0;

      store.continueFromPalier();

      expect(store.screen()).toBe('theme');
      expect(audio.calls.filter(c => c.startsWith('load'))).toEqual([]);
    });

    it('une partie reprise au bilan n\'en rejoue pas le son : le joueur retrouve sa manche', async () => {
      api.meResult = ME({ pending: { sessionId: 7, challengeCode: 'ABC234' } });
      api.sessionResult = lastOfRound().session;
      api.joinResult = { kind: 'ok', play: { ...lastOfRound(), revealed: null, isResuming: true } };
      await store.init();
      await store.begin();

      expect(store.screen()).toBe('playing');
      expect(store.palier()).toBeNull();
    });
  });

  describe('série de bonnes réponses', () => {
    it("rien sous deux morceaux trouvés d'affilée", async () => {
      api.launchResult = { kind: 'ok', play: PLAY({ session: SESSION({ playedTracks: [TRACK({ position: 1 })] }) }) };
      await startRun();
      expect(store.combo()).toBeNull();
    });

    it('puis leur nombre', async () => {
      api.launchResult = { kind: 'ok', play: PLAY({ session: SESSION({ playedTracks: [TRACK({ position: 1 }), TRACK({ position: 2 })] }) }) };
      await startRun();
      expect(store.combo()).toBe(2);
    });
  });

  describe('morceau retiré après une réponse', () => {
    beforeEach(async () => {
      await startRun();
    });

    it('la réponse, puis la carte du retrait, puis le morceau suivant', async () => {
      const withdrawnTrack = TRACK({ position: 2, neutralized: true, points: 0, artist: null, title: null });
      api.answerResult = PLAY({
        session: SESSION({
          totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK(), withdrawnTrack],
          playedTracks: [TRACK(), withdrawnTrack],
        }),
        revealed: TRACK(),
        neutralized: [{ position: 2, round: 1 }],
        current: CURRENT({ position: 3, positionInRound: 3, previewUrl: 'https://cdn/preview-3.mp3' }),
      });
      await send();

      expect(store.revealed()).not.toBeNull();

      store.next();

      expect(store.withdrawn()?.position).toBe(2);
      expect(store.pile().map(e => e.kind === 'track' && e.track.position)).toEqual([1]);

      store.next();

      expect(round.trackId()).toBe(3);
      expect(store.pile().map(e => e.kind === 'track' && e.track.position)).toEqual([2, 1]);
    });
  });

  describe('enchaînement automatique', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await startRun();
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()], playedTracks: [TRACK()] }),
        revealed: TRACK(),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('2 s après la réponse, le morceau suivant part seul', async () => {
      await send();
      expect(store.autoNext()).toBe(true);

      vi.advanceTimersByTime(1999);
      expect(round.trackId()).toBe(1);
      vi.advanceTimersByTime(1);

      expect(store.autoNext()).toBe(false);
      expect(round.trackId()).toBe(2);
      expect(audio.calls).toContain('load https://cdn/preview-2.mp3');
    });

    it('un clic sur « Morceau suivant » n\'attend pas, et rien ne part deux fois', async () => {
      await send();
      store.next();
      audio.calls.length = 0;

      vi.advanceTimersByTime(2500);

      expect(round.trackId()).toBe(2);
      expect(audio.calls.some(c => c.startsWith('load'))).toBe(false);
    });

    it('enchaînement coupé (mouvement réduit, tests de bout en bout) : rien ne part seul', async () => {
      store.setAutoAdvance(false);
      await send();
      vi.advanceTimersByTime(5000);

      expect(store.autoNext()).toBe(false);
      expect(round.trackId()).toBe(1);
    });
  });
});

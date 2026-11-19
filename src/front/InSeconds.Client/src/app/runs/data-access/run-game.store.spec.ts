import { HttpErrorResponse } from '@angular/common/http';
import type { MockInstance } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SessionLoader } from '../../account/data-access/session-loader';
import { SessionStore } from '../../core/session/session.store';
import { FakeAudioPort, provideFakeAudio } from '../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../gameplay/data-access/testing/fake-waveform.port';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RunRoundSummary } from '../domain/run';
import { RunGameStore, RunScreen } from './run-game.store';
import { RunSounds } from './run-sounds';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { StartOutcome } from './runs.api';
import { COMPARISON, CURRENT, FakeRunsApi, LINK, ME, PLAY, ROUND, SESSION, TRACK, provideFakeRunsApi } from './testing/fake-runs-api';

describe('RunGameStore', () => {
  let api: FakeRunsApi;
  const ensureGuest = vi.fn<() => Promise<void>>();
  const setGuestPseudo = vi.fn<(pseudo: string) => Promise<void>>();
  let audio: FakeAudioPort;
  let store: InstanceType<typeof RunGameStore>;
  let round: InstanceType<typeof TrackRoundStore>;
  let sounds: MockInstance<RunSounds['play']>;

  beforeEach(() => {
    api = new FakeRunsApi();
    audio = new FakeAudioPort();
    TestBed.configureTestingModule({
      providers: [provideFakeRunsApi(api), provideFakeAudio(audio), provideFakeWaveform(new FakeWaveformPort()), { provide: SessionLoader, useValue: { ensureGuest, setGuestPseudo } }, TrackRoundStore, RunSounds, RunGameStore, { provide: StoragePort, useValue: new MemoryStoragePort() }],
    });
    ensureGuest.mockReset();
    ensureGuest.mockResolvedValue(undefined);
    setGuestPseudo.mockReset();
    setGuestPseudo.mockResolvedValue(undefined);
    store = TestBed.inject(RunGameStore);
    round = TestBed.inject(TrackRoundStore);
    sounds = vi.spyOn(TestBed.inject(RunSounds), 'play');
  });

  /** Le joueur valide sa saisie : la manche rend la réponse à envoyer, le store l'envoie. */
  async function send(): Promise<void> {
    const sent = round.submit({ artist: 'Daft Punk', title: 'One More Time' });
    if (sent) await store.submit(sent);
  }

  const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
    round: 1, score: 320, outcome: 'shorter', listenSeconds: 10, nextListenSeconds: 5, tracks: [], totalScore: 320, livesLeft: 3, lifeRegained: false, fullPoints: 100, nextFullPoints: 200, ...overrides,
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

    it('pas d\'indice, pas de « écouter plus » : un seul palier', async () => {
      await startRun();

      expect(round.maxStep()).toBe(10);
      expect(round.nextStep()).toBeNull();
      expect(round.availableHintLevels()).toEqual([]);
    });
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

  describe('fin de partie', () => {
    const finish = (status: 'lost', isNew = false) => ({
      status, totalScore: 2500, roundsPassed: 4, foundCount: 18, trackCount: 20,
      tracks: [], rounds: [], record: { bestScore: 2500, bestRoundsPassed: 4, isNew }, challengeCode: 'ABC234', livesLeft: 0, lifeBonus: 0, completeBonus: 0, level: null,
    });

    beforeEach(async () => {
      await startRun();
    });

    it('la dernière réponse : sa révélation, dont le bouton annonce le résultat, puis la fin', async () => {
      api.answerResult = PLAY({
        session: SESSION({ status: 'lost', totalScore: 2500, round: null, finish: finish('lost') }),
        revealed: TRACK({ position: 20, round: 4 }),
        roundSummaries: [summary({ round: 4 })],
        current: null,
      });
      await send();

      expect(store.screen()).toBe('playing');
      expect(store.revealed()).not.toBeNull();
      expect(store.nextEndsRun()).toBe(true);

      store.next();

      expect(store.screen()).toBe('finished');
      expect(store.finish()?.roundsPassed).toBe(4);
      expect(store.revealed()).toBeNull();
      expect(sounds).toHaveBeenCalledWith('lost');
    });

    it('un nouveau record sonne à la fin, à la place du son de victoire ou de défaite', async () => {
      api.answerResult = PLAY({
        session: SESSION({ status: 'lost', totalScore: 2500, round: null, finish: finish('lost', true) }),
        revealed: TRACK({ position: 20, round: 4 }),
        roundSummaries: [summary({ round: 4 })],
        current: null,
      });
      await send();
      store.next();

      expect(store.screen()).toBe('finished');
      expect(sounds).toHaveBeenCalledWith('record');
      expect(sounds).not.toHaveBeenCalledWith('lost');
    });

    it('le duel de la fin : l\'avance sur l\'ami qui a lancé la playlist, rien pour une partie abandonnée', async () => {
      api.answerResult = PLAY({
        session: SESSION({
          status: 'lost', totalScore: 2500, round: null, finish: finish('lost'), ghost: { pseudo: 'Alice', total: 2374, stoppedAtRound: null },
        }),
        revealed: TRACK({ position: 20, round: 4 }),
        roundSummaries: [summary({ round: 4 })],
        current: null,
      });
      await send();
      store.next();

      expect(store.duel()).toEqual({ pseudo: 'Alice', gap: 126 });
    });

    it('une manche ratée mène directement à la fin, sans écran de bilan ni extrait ; le son du run perdu', async () => {
      api.answerResult = PLAY({
        session: SESSION({
          status: 'lost', round: null, finish: finish('lost'), playedTracks: [1, 2, 3, 4, 5].map(position => TRACK({ position })),
        }),
        revealed: TRACK({ position: 5 }),
        roundSummaries: [summary({ score: 150, livesLeft: 0 })],
        current: null,
      });
      await send();
      expect(store.nextEndsRun()).toBe(true);
      // La pile reste sous la dernière réponse (le serveur la rend aussi pour une partie finie), sans le morceau révélé.
      expect(store.pile()).toHaveLength(4);

      store.next();

      expect(store.screen()).toBe('finished');
      expect(sounds).toHaveBeenCalledWith('lost');
      expect(sounds).not.toHaveBeenCalledWith('roundPassed');
      expect(audio.calls.filter(c => c.startsWith('load'))).toHaveLength(1);
    });

    it('« Rejouer » lance une playlist neuve, le premier son dans le clic', async () => {
      api.answerResult = PLAY({ session: SESSION({ status: 'lost', round: null, finish: finish('lost') }), revealed: TRACK(), current: null });
      await send();
      store.next();
      audio.calls.length = 0;
      api.calls.length = 0;
      api.launchResult = { kind: 'ok', play: PLAY({ current: CURRENT({ previewUrl: 'https://cdn/preview-neuf.mp3' }) }) };

      const again = store.playAgain();
      expect(audio.calls[0]).toBe('unlock');
      await again;

      expect(api.calls).toContain('launch');
      expect(store.screen()).toBe('playing');
      expect(audio.calls).toContain('load https://cdn/preview-neuf.mp3');
    });

    it('« Rejouer » seulement avec l\'accès', async () => {
      expect(store.canPlayAgain()).toBe(true);
      api.meResult = ME({ hasAccess: false });
      api.answerResult = PLAY({ session: SESSION({ status: 'lost', round: null, finish: finish('lost') }), revealed: TRACK(), current: null });
      await send();

      store.next();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(store.canPlayAgain()).toBe(false);
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

  describe('chrono', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('part au premier son : annoncé au serveur une seule fois, il descend chaque seconde', async () => {
      await startRun();
      audio.emit('playing');
      TestBed.tick();

      expect(api.calls).toContain('startClock:7:1');
      expect(store.clockLeft()).toBe(45);

      vi.advanceTimersByTime(10_000);
      expect(store.clockShown()).toBeCloseTo(35, 0);

      audio.emit('finished');
      audio.emit('playing');
      TestBed.tick();
      expect(api.calls.filter(c => c.startsWith('startClock'))).toHaveLength(1);
    });

    it('les 5 dernières secondes sont en alerte ; à zéro, le temps est écoulé', async () => {
      await startRun();
      audio.emit('playing');
      TestBed.tick();

      vi.advanceTimersByTime(40_200);
      expect(store.clockAlert()).toBe(true);
      expect(store.timeUp()).toBe(false);

      vi.advanceTimersByTime(5_000);
      expect(store.timeUp()).toBe(true);
      expect(store.clockAlert()).toBe(false);
    });

    it('un tic à chaque seconde des cinq dernières (le service se tait seul pendant un extrait)', async () => {
      await startRun();
      audio.emit('playing');
      TestBed.tick();
      audio.emit('finished');

      vi.advanceTimersByTime(39_900);
      expect(sounds.mock.calls.filter(([sound]) => sound === 'tick')).toHaveLength(0);
      vi.advanceTimersByTime(5_000);
      expect(sounds.mock.calls.filter(([sound]) => sound === 'tick')).toHaveLength(5);
    });

    it('se recale sur le chrono retenu par le serveur quand il reste moins de temps, jamais pour en ajouter', async () => {
      api.clockResult = 20;
      await startRun();
      audio.emit('playing');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(200);

      expect(store.clockShown()).toBeCloseTo(20, 0);
    });

    it('un serveur qui laisse plus de temps ne rallonge pas le chrono', async () => {
      api.clockResult = 60;
      await startRun();
      audio.emit('playing');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(200);

      expect(store.clockShown()).toBeCloseTo(45, 0);
    });

    it('à la reprise, il repart de ce que le serveur dit qu\'il reste, sans attendre le son', async () => {
      api.launchResult = { kind: 'ok', play: PLAY({ session: SESSION({ clockRemainingSeconds: 12 }) }) };
      await startRun();

      expect(store.clockLeft()).toBe(12);
      audio.emit('playing');
      TestBed.tick();
      expect(api.calls.some(c => c.startsWith('startClock'))).toBe(false);
    });

    it('une playlist sans chrono n\'en montre pas', async () => {
      api.launchResult = { kind: 'ok', play: PLAY({ session: SESSION({ answerSeconds: 0 }) }) };
      await startRun();
      audio.emit('playing');
      TestBed.tick();

      expect(store.clockShown()).toBeNull();
      expect(api.calls.some(c => c.startsWith('startClock'))).toBe(false);
    });

    it('la réponse arrête le chrono ; le morceau suivant repart d\'un chrono plein', async () => {
      api.answerResult = PLAY({
        session: SESSION({ totalScore: 100, round: ROUND({ score: 100 }), roundTracks: [TRACK()], playedTracks: [TRACK()] }),
        revealed: TRACK(),
        current: CURRENT({ position: 2, positionInRound: 2, previewUrl: 'https://cdn/preview-2.mp3' }),
      });
      await startRun();
      audio.emit('playing');
      TestBed.tick();
      vi.advanceTimersByTime(20_000);

      await send();
      expect(store.clockLeft()).toBeNull();

      store.next();
      expect(store.clockShown()).toBe(45);
      audio.emit('ready');
      TestBed.tick();
      audio.emit('playing');
      TestBed.tick();
      expect(api.calls).toContain('startClock:7:2');
    });
  });

  describe("le lien d'un ami (/survie/<code>)", () => {
    it("une playlist pas encore jouée : l'écran du lien, sans rien lancer ni créer d'invité", async () => {
      await store.init('abc234');

      expect(store.screen()).toBe('link');
      expect(store.link()?.authorPseudo).toBe('Clément');
      expect(api.calls).toEqual(['me', 'challenge:abc234']);
      expect(ensureGuest).not.toHaveBeenCalled();
    });

    it("un compte qui ouvre le lien d'un ami le reçoit (défi sur son accueil) ; un échec ne change rien à l'écran", async () => {
      TestBed.inject(SessionStore).signedIn({ id: 'a1', pseudo: 'Clem', email: 'c@example.com', isGuest: false, isAdmin: false });
      api.receiveError = new Error('réseau');

      await store.init('ABC234');

      expect(store.screen()).toBe('link');
      expect(api.calls).toContain('receive:ABC234');
    });

    it("un invité n'envoie rien : seuls les comptes reçoivent un défi", async () => {
      TestBed.inject(SessionStore).signedIn({ id: 'g1', pseudo: null, email: null, isGuest: true, isAdmin: false });
      await store.init('ABC234');

      expect(api.calls.some(call => call.startsWith('receive:'))).toBe(false);
    });

    it("une playlist déjà jouée n'est pas un défi reçu", async () => {
      TestBed.inject(SessionStore).signedIn({ id: 'a1', pseudo: 'Clem', email: 'c@example.com', isGuest: false, isAdmin: false });
      api.challengeResult = { kind: 'ok', link: LINK({ myStatus: 'lost', mySessionId: 3 }) };

      await store.init('ABC234');

      expect(api.calls.some(call => call.startsWith('receive:'))).toBe(false);
    });

    it("« Jouer » crée l'invité, relève la playlist et lance le premier son dans le clic", async () => {
      await store.init('ABC234');
      audio.calls.length = 0;

      await store.playLink();

      expect(ensureGuest).toHaveBeenCalledTimes(1);
      expect(api.calls.at(-1)).toBe('join:ABC234');
      expect(store.screen()).toBe('playing');
      expect(audio.calls[0]).toBe('unlock');
    });

    it("un invité qu'on n'arrive pas à créer affiche l'erreur", async () => {
      await store.init('ABC234');
      ensureGuest.mockRejectedValue(new Error('réseau'));

      await store.playLink();

      expect(store.screen()).toBe('error');
      expect(api.calls.some(call => call.startsWith('join:'))).toBe(false);
    });

    it("une partie en cours sur ce lien : l'écran de reprise, qui relève cette playlist", async () => {
      api.challengeResult = { kind: 'ok', link: LINK({ myStatus: 'pending', mySessionId: 7 }) };
      api.sessionResult = SESSION({ roundTracks: [TRACK()] });

      await store.init('ABC234');

      expect(store.screen()).toBe('resume');
      expect(api.calls).toContain('session:7');

      await store.begin();

      expect(api.calls.at(-1)).toBe('join:ABC234');
    });

    it.each(['lost', 'abandoned'] as const)("une partie %s sur ce lien : directement la comparaison", async status => {
      api.challengeResult = { kind: 'ok', link: LINK({ myStatus: status, mySessionId: 7 }) };

      await store.init('ABC234');

      expect(store.screen()).toBe('comparison');
      expect(store.comparison()).toEqual(COMPARISON());
      expect(api.calls).toContain('comparison:ABC234');
    });

    it("le lien d'un ami sans l'accès au mode : écran de blocage, la playlist n'est même pas lue", async () => {
      api.meResult = ME({ hasAccess: false });

      await store.init('ABC234');

      expect(store.screen()).toBe('link_blocked');
      expect(api.calls).toEqual(['me']);
    });

    it('une playlist inconnue : le dit, sans réessayer', async () => {
      api.challengeResult = { kind: 'not_found' };

      await store.init('ZZZZZZ');

      expect(store.screen()).toBe('not_found');
    });

    it("une erreur du lien ou de la comparaison affiche l'erreur, et « Réessayer » rouvre le même lien", async () => {
      api.challengeResult = { kind: 'error' };
      await store.init('ABC234');
      expect(store.screen()).toBe('error');

      api.challengeResult = { kind: 'ok', link: LINK({ myStatus: 'lost', mySessionId: 7 }) };
      api.comparisonResult = new Error('réseau');
      await store.init();
      expect(store.screen()).toBe('error');

      api.comparisonResult = COMPARISON();
      await store.init();
      expect(store.screen()).toBe('comparison');
      expect(api.calls.filter(call => call === 'challenge:ABC234')).toHaveLength(3);
    });

    it("la partie jouée sur un lien finit par l'écran de fin, puis la comparaison s'ouvre d'un clic", async () => {
      await store.init('ABC234');
      api.joinResult = { kind: 'ok', play: PLAY({ session: SESSION({ status: 'lost', round: null, finish: null }), current: null }) };
      await store.playLink();
      expect(store.screen()).toBe('finished');

      await store.showComparison();

      expect(store.screen()).toBe('comparison');
    });

    it("sur /runs, la comparaison d'une partie finie se lit avec le code de la playlist de la fin", async () => {
      const finish = {
        status: 'lost' as const, totalScore: 2600, roundsPassed: 4, foundCount: 20, trackCount: 20, tracks: [],
        rounds: [], record: null, challengeCode: 'XYZ789', livesLeft: 0, lifeBonus: 0, completeBonus: 0, level: null,
      };
      api.launchResult = { kind: 'ok', play: PLAY({ session: SESSION({ status: 'lost', round: null, finish }), current: null }) };
      await store.init();
      await store.begin();

      await store.showComparison();

      expect(api.calls.at(-1)).toBe('comparison:XYZ789');
      expect(store.screen()).toBe('comparison');
    });
  });

  describe("le pseudo de l'invité", () => {
    const finishedGuest = (pseudo: string | null): void => {
      TestBed.inject(SessionStore).signedIn({ id: 'g1', pseudo, email: null, isGuest: true, isAdmin: false });
      api.challengeResult = { kind: 'ok', link: LINK({ myStatus: 'lost', mySessionId: 7 }) };
    };

    it("un invité sans pseudo qui a fini la playlist d'un ami le donne avant la comparaison", async () => {
      finishedGuest(null);

      await store.init('ABC234');

      expect(store.screen()).toBe('pseudo');
      expect(api.calls).not.toContain('comparison:ABC234');
    });

    it('un invité qui a déjà un pseudo, ou un compte, va droit à la comparaison', async () => {
      finishedGuest('Léa');
      await store.init('ABC234');
      expect(store.screen()).toBe('comparison');

      TestBed.inject(SessionStore).signedIn({ id: 'a1', pseudo: 'Clem', email: 'c@example.com', isGuest: false, isAdmin: false });
      await store.init('ABC234');
      expect(store.screen()).toBe('comparison');
    });

    it('enregistre le pseudo (espaces retirés) puis ouvre la comparaison', async () => {
      finishedGuest(null);
      await store.init('ABC234');

      await store.savePseudo('  Léa ');

      expect(setGuestPseudo).toHaveBeenCalledWith('Léa');
      expect(store.screen()).toBe('comparison');
      expect(store.pseudoError()).toBeNull();
    });

    it('un pseudo invalide reste sur l\'écran sans appeler le serveur', async () => {
      finishedGuest(null);
      await store.init('ABC234');

      await store.savePseudo(' ');

      expect(setGuestPseudo).not.toHaveBeenCalled();
      expect(store.screen()).toBe('pseudo');
      expect(store.pseudoError()).toMatch(/^runs\.pseudo\./);
    });

    it("un pseudo déjà pris par un compte reste sur l'écran avec son message", async () => {
      finishedGuest(null);
      await store.init('ABC234');
      setGuestPseudo.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'players.pseudo_taken' } }));

      await store.savePseudo('Clem');

      expect(store.screen()).toBe('pseudo');
      expect(store.pseudoError()).toBe('runs.pseudo.taken');
      expect(store.pseudoBusy()).toBe(false);
    });

    it("le crayon rouvre l'écran pour un invité, et « Annuler » revient à la comparaison", async () => {
      finishedGuest('Léa');
      await store.init('ABC234');

      store.editPseudo();
      expect(store.screen()).toBe('pseudo');

      store.cancelPseudo();
      expect(store.screen()).toBe('comparison');
    });

    it('le crayon ne fait rien pour un compte (il passe par son profil)', async () => {
      TestBed.inject(SessionStore).signedIn({ id: 'a1', pseudo: 'Clem', email: 'c@example.com', isGuest: false, isAdmin: false });
      api.challengeResult = { kind: 'ok', link: LINK({ myStatus: 'lost', mySessionId: 7 }) };
      await store.init('ABC234');

      store.editPseudo();

      expect(store.screen()).toBe('comparison');
    });
  });
});

import type { MockInstance } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FakeAudioPort } from '../../gameplay/data-access/testing/fake-audio.port';
import { RunGameStore } from './run-game.store';
import { RunSounds } from './run-sounds';
import { CURRENT, FakeRunsApi, ME, PLAY, ROUND, SESSION, TRACK } from './testing/fake-runs-api';
import { setupRunGame } from './testing/run-game-harness';

describe('RunGameStore, chrono et fin de partie', () => {
  const h = setupRunGame();
  let api: FakeRunsApi;
  let audio: FakeAudioPort;
  let store: InstanceType<typeof RunGameStore>;
  let sounds: MockInstance<RunSounds['play']>;
  const { send, startRun, summary } = h;

  beforeEach(() => {
    ({ api, audio, store, sounds } = h.current());
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
      expect(store.shownRound()).toBe(1);
      expect(store.lives()).toEqual([true, true, true]);
      expect(store.pile()).toEqual([]);
      expect(store.totalScore()).toBe(0);
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
});

import type { MockInstance } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { MemoryStoragePort, StoragePort } from '../../../core/storage/storage.port';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../../gameplay/data-access/testing/fake-waveform.port';
import { TrackRoundStore } from '../../../gameplay/data-access/track-round.store';
import { RunRoundSummary } from '../../domain/run';
import { RunGameStore } from '../run-game.store';
import { RunSounds } from '../run-sounds';
import { FakeRunsApi, provideFakeRunsApi } from './fake-runs-api';

/** Ce que chaque test d'un spec de `RunGameStore` reçoit, neuf à chaque test. */
export interface RunGameTest {
  readonly api: FakeRunsApi;
  readonly audio: FakeAudioPort;
  readonly store: InstanceType<typeof RunGameStore>;
  readonly round: InstanceType<typeof TrackRoundStore>;
  readonly sounds: MockInstance<RunSounds['play']>;
}

/**
 * Le montage commun des specs de `RunGameStore` : le faux de l'API, le faux lecteur, les stores, et les aides que tous reprennent (`send`,
 * `startRun`, `summary`). À appeler dans le `describe` du spec : il enregistre son `beforeEach`, `current()` rend les instances du test en cours.
 */
export function setupRunGame() {
  const ensureGuest = vi.fn<() => Promise<void>>();
  const setGuestPseudo = vi.fn<(pseudo: string) => Promise<void>>();
  let state: RunGameTest;

  beforeEach(() => {
    const api = new FakeRunsApi();
    const audio = new FakeAudioPort();
    TestBed.configureTestingModule({
      providers: [
        provideFakeRunsApi(api), provideFakeAudio(audio), provideFakeWaveform(new FakeWaveformPort()), { provide: SessionLoader, useValue: { ensureGuest, setGuestPseudo } },
        TrackRoundStore, RunSounds, RunGameStore, { provide: StoragePort, useValue: new MemoryStoragePort() },
      ],
    });
    ensureGuest.mockReset();
    ensureGuest.mockResolvedValue(undefined);
    setGuestPseudo.mockReset();
    setGuestPseudo.mockResolvedValue(undefined);
    state = {
      api, audio, store: TestBed.inject(RunGameStore), round: TestBed.inject(TrackRoundStore), sounds: vi.spyOn(TestBed.inject(RunSounds), 'play'),
    };
  });

  /** Le joueur valide sa saisie : la manche rend la réponse à envoyer, le store l'envoie. */
  async function send(): Promise<void> {
    const sent = state.round.submit({ artist: 'Daft Punk', title: 'One More Time' });
    if (sent) await state.store.submit(sent);
  }

  const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
    round: 1, score: 320, outcome: 'shorter', listenSeconds: 10, nextListenSeconds: 5, tracks: [], totalScore: 320, livesLeft: 3, lifeRegained: false, fullPoints: 100, nextFullPoints: 200, ...overrides,
  });

  /** Lance la partie et laisse le lecteur annoncer son extrait prêt. */
  async function startRun(): Promise<void> {
    await state.store.init();
    await state.store.begin();
    state.audio.emit('ready');
    TestBed.tick();
  }

  return { ensureGuest, setGuestPseudo, current: () => state, send, startRun, summary };
}

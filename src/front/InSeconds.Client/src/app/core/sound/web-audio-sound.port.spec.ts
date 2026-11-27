import { SOUND_FILES, WebAudioSoundPort } from './sound.port';

describe('WebAudioSoundPort', () => {
  let started: number;
  let state: string;
  let resumed: number;
  let fetched: string[];
  let failing: Set<string>;

  beforeEach(() => {
    started = 0;
    resumed = 0;
    state = 'running';
    fetched = [];
    failing = new Set();
    class FakeContext {
      get state() { return state; }
      destination = {};
      resume = () => { resumed++; state = 'running'; return Promise.resolve(); };
      decodeAudioData = () => Promise.resolve({} as AudioBuffer);
      createGain = () => ({ gain: { value: 0 }, connect: (node: unknown) => node });
      createBufferSource = () => ({ buffer: null, connect: (node: unknown) => node, start: () => { started++; } });
    }
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('fetch', (url: string) => {
      fetched.push(url);
      return Promise.resolve({ ok: !failing.has(url), arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  it('charge les quatre sons au déverrouillage puis joue sans rien refaire', async () => {
    const port = new WebAudioSoundPort();
    port.unlock();
    await settle();
    port.unlock();
    await settle();
    expect(fetched.sort()).toEqual(Object.values(SOUND_FILES).sort());
    port.play('correct');
    expect(started).toBe(1);
  });

  it("un fichier en échec se retente au déverrouillage suivant, sans refaire ceux qui ont réussi", async () => {
    failing.add(SOUND_FILES.wrong);
    const port = new WebAudioSoundPort();
    port.unlock();
    await settle();
    port.play('wrong');
    expect(started).toBe(0);

    failing.clear();
    fetched = [];
    port.unlock();
    await settle();
    expect(fetched).toEqual([SOUND_FILES.wrong]);
    port.play('wrong');
    expect(started).toBe(1);
  });

  it('un contexte suspendu est relancé avant de jouer, et rien ne part avant le premier déverrouillage', async () => {
    const port = new WebAudioSoundPort();
    port.play('finish');
    expect(started).toBe(0);
    port.unlock();
    await settle();
    state = 'suspended';
    port.play('finish');
    await settle();
    expect(resumed).toBeGreaterThan(1);
    expect(started).toBe(1);
  });
});

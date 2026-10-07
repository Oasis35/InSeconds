import { TestBed } from '@angular/core/testing';
import { AudioStatus } from '../domain/track-round';
import { HowlerAudioPort } from './howler-audio.port';
import { makeToneUrl } from './testing/wav';

/**
 * Le lecteur sur Howler, essayé pour de bon : un vrai Chromium (lancé avec l'autoplay autorisé,
 * `vitest.config.ts`) télécharge, décode et joue de vrais sons. On mesure le temps qui s'écoule
 * entre le début de la lecture et la fin du palier : sans chrono dans le lecteur, c'est le
 * navigateur qui arrête le son.
 */
describe('HowlerAudioPort', () => {
  let port: HowlerAudioPort;
  let tone: string;

  /** Les états traversés, dans l'ordre (sans doublon consécutif). */
  let history: AudioStatus[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HowlerAudioPort] });
    port = TestBed.inject(HowlerAudioPort);
    tone = makeToneUrl(1.5);
    history = [];
  });

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  /** Attend l'état demandé en notant ceux qu'on traverse ; rend le temps écoulé depuis `since`. */
  async function until(state: AudioStatus, since = performance.now(), timeout = 4000): Promise<number> {
    for (;;) {
      const current = port.state();
      if (history.at(-1) !== current) history.push(current);
      if (current === state) return performance.now() - since;
      if (performance.now() - since > timeout) throw new Error(`« ${state} » jamais atteint (état : ${current})`);
      await sleep(4);
    }
  }

  async function loaded(): Promise<void> {
    port.load(tone);
    await until('ready');
  }

  it('charge un extrait : loading puis ready, au début', async () => {
    port.load(tone);
    expect(port.state()).toBe('loading');
    await until('ready');
    expect(history).toEqual(['loading', 'ready']);
    expect(port.position()).toBe(0);
  });

  it('s\'arrête au palier, au navigateur près : 0,5 s de lecture, ni plus ni moins', async () => {
    await loaded();
    port.playUntil(0.5);
    expect(port.state()).toBe('playing');

    const elapsed = await until('finished');

    expect(elapsed).toBeGreaterThanOrEqual(470);
    expect(elapsed).toBeLessThan(1500);
    expect(port.position()).toBe(0.5);
    expect(history).toEqual(['loading', 'ready', 'playing', 'finished']);
  });

  it('avance la position pendant la lecture', async () => {
    await loaded();
    port.playUntil(1);
    await sleep(400);
    expect(port.state()).toBe('playing');
    expect(port.position()).toBeGreaterThan(0.1);
    expect(port.position()).toBeLessThan(1);
    await until('finished');
    expect(port.position()).toBe(1);
  });

  it('prolonger pendant la lecture continue depuis la position atteinte, sans repartir de zéro', async () => {
    await loaded();
    const start = performance.now();
    port.playUntil(0.4);
    await sleep(150);
    port.playUntil(0.9);

    const elapsed = await until('finished', start);

    // 0,9 s en tout, pas 0,15 + 0,9 : la lecture n'est pas repartie du début
    expect(elapsed).toBeGreaterThanOrEqual(860);
    expect(elapsed).toBeLessThan(2000);
    expect(port.position()).toBe(0.9);
  });

  it('prolonger après un palier joué reprend là où il s\'était arrêté (« écouter plus »)', async () => {
    await loaded();
    port.playUntil(0.4);
    await until('finished');
    expect(port.position()).toBe(0.4);

    const start = performance.now();
    port.playUntil(0.9);
    expect(port.state()).toBe('playing');
    const elapsed = await until('finished', start);

    // 0,5 s de plus, pas 0,9 s depuis le début
    expect(elapsed).toBeGreaterThanOrEqual(470);
    expect(elapsed).toBeLessThan(1500);
    expect(port.position()).toBe(0.9);
  });

  it('prolonger pendant le chargement joue jusqu\'au dernier palier demandé (piège 40)', async () => {
    const start = performance.now();
    port.load(tone);
    port.playUntil(0.3);
    port.playUntil(0.7);
    expect(port.state()).toBe('loading');

    const elapsed = await until('finished', start);

    expect(history).toContain('playing');
    expect(elapsed).toBeGreaterThanOrEqual(670);
    expect(elapsed).toBeLessThan(2500);
    expect(port.position()).toBe(0.7);
  });

  it('rejoue le palier depuis le début (↺)', async () => {
    await loaded();
    port.playUntil(0.4);
    await until('finished');

    const start = performance.now();
    port.replay(0.4);
    expect(port.state()).toBe('playing');
    const elapsed = await until('finished', start);

    expect(elapsed).toBeGreaterThanOrEqual(370);
    expect(elapsed).toBeLessThan(1500);
    expect(port.position()).toBe(0.4);
  });

  it('rejouer pendant la lecture repart de zéro sans empiler les sons', async () => {
    await loaded();
    port.playUntil(0.6);
    await sleep(300);
    const start = performance.now();
    port.replay(0.6);

    const elapsed = await until('finished', start);

    expect(elapsed).toBeGreaterThanOrEqual(570);
    expect(elapsed).toBeLessThan(1800);
  });

  it('joue tout l\'extrait après la révélation, puis finit', async () => {
    port.load(makeToneUrl(0.8));
    await until('ready');
    port.playUntil(0.3);
    await until('finished');

    const start = performance.now();
    port.playFull();
    const elapsed = await until('finished', start);

    expect(elapsed).toBeGreaterThanOrEqual(770);
    expect(elapsed).toBeLessThan(2000);
    expect(port.position()).toBeCloseTo(0.8, 1);
  });

  it('un extrait plus court que le palier : la fin de l\'extrait est la fin du palier', async () => {
    port.load(makeToneUrl(0.5));
    await until('ready');
    const start = performance.now();
    port.playUntil(5);

    const elapsed = await until('finished', start);

    expect(elapsed).toBeLessThan(1800);
    expect(port.position()).toBeCloseTo(0.5, 1);
  });

  it('un extrait introuvable est une erreur, jamais le repos (piège 33)', async () => {
    port.load('blob:http://localhost/introuvable');
    await until('error');
    expect(history).not.toContain('idle');
    expect(history).not.toContain('ready');
  });

  it('une erreur n\'empêche pas de réessayer : le même extrait se recharge', async () => {
    port.load('blob:http://localhost/introuvable');
    await until('error');

    port.load(tone);
    await until('ready');
    port.playUntil(0.3);
    await until('finished');
    expect(port.position()).toBe(0.3);
  });

  it('prolonger après une erreur ne fait rien', async () => {
    port.load('blob:http://localhost/introuvable');
    await until('error');
    port.playUntil(1);
    port.replay(1);
    port.playFull();
    expect(port.state()).toBe('error');
  });

  it('stop coupe le son et revient au repos, sans réveil tardif', async () => {
    await loaded();
    port.playUntil(0.4);
    await sleep(100);
    port.stop();
    expect(port.state()).toBe('idle');
    expect(port.position()).toBe(0);

    await sleep(500);
    expect(port.state()).toBe('idle');
  });

  it('charger un autre morceau en cours de lecture coupe le premier', async () => {
    await loaded();
    port.playUntil(1);
    await sleep(100);
    const other = makeToneUrl(0.6);
    port.load(other);
    await until('ready');
    expect(port.position()).toBe(0);

    await sleep(300);
    expect(port.state()).toBe('ready');
  });

  it('ne garde en mémoire que le morceau en cours et le suivant', async () => {
    const [a, b, c] = [makeToneUrl(0.4), makeToneUrl(0.4), makeToneUrl(0.4)];
    port.load(a, b);
    await until('ready');
    expect(port.loadedUrls()).toEqual([a, b]);

    port.load(b, c);
    await until('ready');
    expect(port.loadedUrls().sort()).toEqual([b, c].sort());

    port.load(c);
    await until('ready');
    expect(port.loadedUrls()).toEqual([c]);
  });

  it('un suivant préchargé qui échoue ne bloque pas la manche d\'après : erreur, puis nouvel essai', async () => {
    const broken = 'blob:http://localhost/suivant-introuvable';
    port.load(tone, broken);
    await until('ready');
    await sleep(300); // le préchargement du suivant échoue

    port.load(broken);
    await until('error');
    expect(port.loadedUrls()).not.toContain(broken);
  });

  it('révéler pendant le chargement joue tout l\'extrait, pas le dernier palier', async () => {
    port.load(makeToneUrl(0.9));
    port.playUntil(0.2);
    port.playFull();

    const start = performance.now();
    await until('playing', start);
    const elapsed = await until('finished', start);

    expect(elapsed).toBeGreaterThanOrEqual(850);
    expect(port.position()).toBeCloseTo(0.9, 1);
  });

  it('demande à iOS de jouer malgré le mode silencieux quand la session audio existe', () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
    try {
      const fresh = TestBed.runInInjectionContext(() => new HowlerAudioPort());
      expect(fresh).toBeTruthy();
      expect(session.type).toBe('playback');
    } finally {
      Reflect.deleteProperty(navigator, 'audioSession');
    }
  });

  afterEach(() => port.stop());
});

import { TestBed } from '@angular/core/testing';
import { AudioStatus } from '../domain/track-round';
import { ErrorReportingService } from '../../core/errors/error-reporting.service';
import { HtmlAudioPort, describeAudioError, describeStall } from './html-audio.port';
import { makeToneUrl } from './testing/wav';

/**
 * Le lecteur sur un élément audio, essayé pour de bon : un vrai Chromium (lancé avec l'autoplay
 * autorisé, `vitest.config.ts`) charge et joue de vrais sons. On mesure le temps qui s'écoule entre
 * le début de la lecture et la fin du palier, et on simule les démarrages lents de l'iPhone.
 */
describe('HtmlAudioPort', () => {
  let port: HtmlAudioPort;
  let element: HTMLAudioElement;
  let tone: string;

  /** Les états traversés, dans l'ordre (sans doublon consécutif). */
  let history: AudioStatus[];
  let report: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    report = vi.fn();
    TestBed.configureTestingModule({
      providers: [HtmlAudioPort, { provide: ErrorReportingService, useValue: { report } }],
    });
    port = TestBed.inject(HtmlAudioPort);
    element = (port as unknown as { audio: HTMLAudioElement }).audio;
    tone = makeToneUrl(1.5);
    history = [];
  });

  afterEach(() => port.stop());

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

  async function loaded(url = tone): Promise<void> {
    port.load(url);
    await until('ready');
  }

  /** Comme Safari sur iPhone : `playing` part dès l'appel, le son 400 ms plus tard, sans second `playing`. */
  function simulateIosLatePlaying(): void {
    const realPlay = element.play.bind(element);
    vi.spyOn(element, 'play').mockImplementation(() => {
      element.onplaying?.call(element, new Event('playing')); // faux départ, position encore à 0
      element.onplaying = null; // le vrai `playing` n'est plus écouté
      return new Promise<void>((resolve, reject) => setTimeout(() => realPlay().then(resolve, reject), 400));
    });
  }

  it('charge un extrait : loading puis ready, au début', async () => {
    port.load(tone);
    expect(port.state()).toBe('loading');
    await until('ready');
    expect(history).toEqual(['loading', 'ready']);
    expect(port.position()).toBe(0);
  });

  it('s\'arrête au palier : 0,5 s de lecture, ni plus ni moins', async () => {
    await loaded();
    port.playUntil(0.5);
    expect(port.state()).toBe('playing');

    const elapsed = await until('finished');

    expect(elapsed).toBeGreaterThanOrEqual(470);
    expect(elapsed).toBeLessThan(1500);
    expect(element.currentTime).toBeGreaterThanOrEqual(0.49);
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

  it('prolonger pendant la lecture continue depuis la position atteinte, sans relancer le son', async () => {
    await loaded();
    const play = vi.spyOn(element, 'play');
    const start = performance.now();
    port.playUntil(0.4);
    await sleep(150);
    port.playUntil(0.9);

    const elapsed = await until('finished', start);

    // 0,9 s en tout, pas 0,15 + 0,9 : la lecture n'est pas repartie du début, et le son n'a pas été relancé
    expect(elapsed).toBeGreaterThanOrEqual(860);
    expect(elapsed).toBeLessThan(2000);
    expect(play).toHaveBeenCalledTimes(1);
    expect(port.position()).toBe(0.9);
  });

  it('prolonger après un palier joué relit depuis le début jusqu\'au nouveau palier (« écouter plus », comme en v1)', async () => {
    await loaded();
    port.playUntil(0.4);
    await until('finished');
    expect(port.position()).toBe(0.4);

    const start = performance.now();
    port.playUntil(0.9);
    expect(port.state()).toBe('playing');
    expect(port.position()).toBe(0);
    const elapsed = await until('finished', start);

    // 0,9 s depuis le début, pas seulement les 0,5 s ajoutées
    expect(elapsed).toBeGreaterThanOrEqual(860);
    expect(elapsed).toBeLessThan(2000);
    expect(port.position()).toBe(0.9);
  });

  it('prolonger pendant le chargement joue jusqu\'au dernier palier demandé (piège 40)', async () => {
    port.load(tone);
    port.playUntil(0.3);
    port.playUntil(0.7);
    expect(port.state()).toBe('loading');

    await until('playing');
    const elapsed = await until('finished');

    expect(elapsed).toBeGreaterThanOrEqual(660);
    expect(element.currentTime).toBeGreaterThanOrEqual(0.69);
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

  it('rejouer pendant la lecture repart de zéro', async () => {
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
    await loaded(makeToneUrl(0.8));
    port.playUntil(0.3);
    await until('finished');

    const start = performance.now();
    port.playFull();
    const elapsed = await until('finished', start);

    expect(elapsed).toBeGreaterThanOrEqual(740);
    expect(elapsed).toBeLessThan(2000);
    expect(port.position()).toBeCloseTo(0.8, 1);
  });

  it('révéler pendant le chargement joue tout l\'extrait, pas le dernier palier', async () => {
    port.load(makeToneUrl(0.9));
    port.playUntil(0.2);
    port.playFull();

    await until('playing');
    const elapsed = await until('finished');

    expect(elapsed).toBeGreaterThanOrEqual(820);
    expect(port.position()).toBeCloseTo(0.9, 1);
  });

  it('un extrait plus court que le palier : la fin de l\'extrait est la fin du palier', async () => {
    await loaded(makeToneUrl(0.5));
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

  it('un extrait illisible est remonté avec le code du navigateur, sans son adresse', async () => {
    port.load('blob:http://localhost/introuvable');
    await until('error');

    expect(report).toHaveBeenCalledOnce();
    const sent = report.mock.calls[0][0];
    expect(sent.source).toBe('js');
    expect(sent.message).toMatch(/^AudioError: chargement, MEDIA_ERR_/);
    expect(JSON.stringify(sent)).not.toContain('introuvable');
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
    expect(element.paused).toBe(true);

    await sleep(500);
    expect(port.state()).toBe('idle');
  });

  it('stop pendant le chargement : l\'extrait prêt plus tard ne relance rien', async () => {
    port.load(tone);
    port.playUntil(0.5);
    port.stop();

    await sleep(400);
    expect(port.state()).toBe('idle');
    expect(element.paused).toBe(true);
  });

  it('charger un autre morceau en cours de lecture coupe le premier', async () => {
    await loaded();
    port.playUntil(1);
    await sleep(100);
    port.load(makeToneUrl(0.6));
    await until('ready');
    expect(port.position()).toBe(0);

    await sleep(300);
    expect(port.state()).toBe('ready');
    expect(element.paused).toBe(true);
  });

  it('annonce le morceau suivant au navigateur une fois le courant prêt, un seul à la fois', async () => {
    const preloads = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="audio"]')].map(l => l.href);
    const [a, b, c] = [makeToneUrl(0.4), makeToneUrl(0.4), makeToneUrl(0.4)];

    port.load(a, b);
    expect(preloads()).toEqual([]);
    await until('ready');
    expect(preloads()).toEqual([b]);

    port.load(b, c);
    await until('ready');
    expect(preloads()).toEqual([c]);

    port.load(c);
    await until('ready');
    expect(preloads()).toEqual([]);
  });

  describe('arrêt calé sur le son réel (pièges 44 et 46)', () => {
    it('un démarrage lent du son ne raccourcit pas le palier', async () => {
      await loaded();
      // Comme sur un téléphone : le son ne sort que 400 ms après l'appel à play(), plus que le palier.
      const realPlay = element.play.bind(element);
      vi.spyOn(element, 'play').mockImplementation(
        () => new Promise<void>((resolve, reject) => setTimeout(() => realPlay().then(resolve, reject), 400)),
      );

      port.playUntil(0.2);
      await until('finished', performance.now(), 5000);

      expect(element.currentTime).toBeGreaterThanOrEqual(0.19);
    });

    it('un événement playing émis avant le vrai démarrage du son ne raccourcit pas le palier', async () => {
      await loaded();
      simulateIosLatePlaying();

      port.playUntil(0.2);
      await until('finished', performance.now(), 5000);

      expect(element.currentTime).toBeGreaterThanOrEqual(0.19);
    });

    it('une relecture (↺) joue le palier en entier même si le son tarde à repartir', async () => {
      await loaded();
      port.playUntil(0.2);
      await until('finished');

      simulateIosLatePlaying();
      port.replay(0.2);
      await until('playing');
      await until('finished', performance.now(), 5000);

      expect(element.currentTime).toBeGreaterThanOrEqual(0.19);
    });
  });

  describe('son lent ou coupé, remonté pour le diagnostic', () => {
    const timings = (over: Partial<Parameters<typeof describeStall>[1]> = {}) =>
      ({ startedAt: 0, firstSoundAt: 300, waitingSince: null, stalls: 0, stallMs: 0, ...over });

    it('rien à dire sur un palier qui démarre vite, sans coupure', () => {
      expect(describeStall(1, timings(), 1300)).toBeNull();
    });

    it('décrit un démarrage lent', () => {
      expect(describeStall(1.5, timings({ firstSoundAt: 2140 }), 3000))
        .toBe('AudioStall: palier 1.5 s, premier son après 2100 ms, aucune coupure');
    });

    it('décrit les coupures en route', () => {
      expect(describeStall(5, timings({ stalls: 1, stallMs: 870 }), 6000))
        .toBe('AudioStall: palier 5 s, premier son après 300 ms, 1 coupure (900 ms)');
      expect(describeStall(5, timings({ stalls: 3, stallMs: 2420 }), 8000))
        .toBe('AudioStall: palier 5 s, premier son après 300 ms, 3 coupures (2400 ms)');
    });

    it('un son qui ne sort jamais compte jusqu\'à la fin du palier', () => {
      expect(describeStall(1, timings({ firstSoundAt: null }), 2000))
        .toBe('AudioStall: palier 1 s, premier son après 2000 ms, aucune coupure');
    });

    it('un palier joué normalement ne remonte rien', async () => {
      await loaded();
      port.playUntil(0.2);
      await until('finished');

      expect(report).not.toHaveBeenCalled();
    });

    it('un son qui tarde à sortir est remonté', async () => {
      await loaded();
      const realPlay = element.play.bind(element);
      vi.spyOn(element, 'play').mockImplementation(
        () => new Promise<void>((resolve, reject) => setTimeout(() => realPlay().then(resolve, reject), 1700)),
      );

      port.playUntil(0.2);
      await until('finished', performance.now(), 5000);

      expect(report).toHaveBeenCalledOnce();
      expect(report.mock.calls[0][0]).toEqual({
        source: 'js',
        message: expect.stringMatching(/^AudioStall: palier 0.2 s, premier son après \d+ ms, aucune coupure$/),
      });
    });

    it('une coupure en pleine lecture est comptée', async () => {
      await loaded();
      port.playUntil(0.6);
      await until('playing');
      while (port.position() === 0) await sleep(4); // le premier son est noté par la boucle de lecture

      element.dispatchEvent(new Event('waiting'));
      await sleep(150);
      element.dispatchEvent(new Event('playing'));
      await until('finished');

      expect(report).toHaveBeenCalledOnce();
      expect(report.mock.calls[0][0].message).toMatch(/, 1 coupure \(\d+ ms\)$/);
    });

    it('une lecture arrêtée avant la fin ne remonte rien', async () => {
      await loaded();
      port.playUntil(1);
      await until('playing');
      port.stop();

      expect(report).not.toHaveBeenCalled();
    });
  });

  describe('échecs de lecture', () => {
    it('une lecture refusée est une erreur, jamais le repos (piège 33)', async () => {
      await loaded();
      vi.spyOn(element, 'play').mockRejectedValue(new DOMException('refusé', 'NotAllowedError'));

      port.playUntil(0.3);

      await until('error');
      expect(history).not.toContain('idle');
      expect(report).toHaveBeenCalledWith({ source: 'js', message: 'AudioError: lecture, NotAllowedError' });
    });

    it('une lecture interrompue par notre propre pause (AbortError) n\'est pas une erreur', async () => {
      await loaded();
      vi.spyOn(element, 'play').mockRejectedValue(new DOMException('interrompu', 'AbortError'));

      port.playUntil(0.3);
      await sleep(50);

      expect(port.state()).toBe('playing');
    });

    it('un échec de la lecture complète termine sans erreur : il n\'y a plus rien à proposer', async () => {
      await loaded();
      port.playUntil(0.2);
      await until('finished');
      vi.spyOn(element, 'play').mockRejectedValue(new DOMException('refusé', 'NotAllowedError'));

      port.playFull();
      await sleep(50);

      expect(port.state()).toBe('finished');
      expect(report).not.toHaveBeenCalled();
    });
  });

  describe('describeAudioError', () => {
    it('nomme le code MediaError, ou l\'exception de play()', () => {
      const mediaError = Object.create(MediaError.prototype, { code: { value: 4 } }) as MediaError;
      expect(describeAudioError('chargement', mediaError)).toBe('AudioError: chargement, MEDIA_ERR_SRC_NOT_SUPPORTED');
      expect(describeAudioError('lecture', new DOMException('refusé', 'NotAllowedError'))).toBe('AudioError: lecture, NotAllowedError');
      expect(describeAudioError('chargement', null)).toBe('AudioError: chargement, inconnue');
    });
  });

  describe('déverrouillage dans le clic (iPhone)', () => {
    it('fait jouer un silence à l\'élément partagé, une seule fois, sans changer d\'état', async () => {
      const play = vi.spyOn(element, 'play');

      port.unlock();
      port.unlock();

      expect(play).toHaveBeenCalledTimes(1);
      expect(element.src).toMatch(/^blob:/);
      expect(port.state()).toBe('idle');
      await sleep(100);
      expect(element.paused).toBe(true);
    });

    it('le son joue ensuite normalement, même chargé aussitôt après', async () => {
      port.unlock();
      port.load(tone);
      port.playUntil(0.3);

      await until('finished');
      expect(port.position()).toBe(0.3);
    });

    it('un déverrouillage refusé se retente au clic suivant', async () => {
      const play = vi.spyOn(element, 'play').mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));

      port.unlock();
      await sleep(20);
      port.unlock();

      expect(play).toHaveBeenCalledTimes(2);
    });

    it('déjà déverrouillé, ne touche pas à un extrait chargé', async () => {
      port.unlock();
      await sleep(50);
      await loaded();
      const play = vi.spyOn(element, 'play');

      port.unlock();

      expect(play).not.toHaveBeenCalled();
      expect(element.src).toBe(tone);
      expect(port.state()).toBe('ready');
    });

    it('un refus se retente sur l\'extrait chargé, en muet, sans le couper (#313)', async () => {
      vi.spyOn(element, 'play').mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
      port.unlock();
      await sleep(20);
      await loaded();
      const play = vi.spyOn(element, 'play');
      play.mockClear();

      port.unlock();
      expect(element.muted).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
      await sleep(100);

      expect(element.src).toBe(tone);
      expect(element.paused).toBe(true);
      expect(element.muted).toBe(false);
      expect(element.currentTime).toBe(0);
      expect(port.state()).toBe('ready');

      // l'extrait joue ensuite normalement, avec le son
      port.playUntil(0.3);
      await until('finished');
      expect(port.position()).toBe(0.3);
      expect(element.muted).toBe(false);
    });

    it('pendant le chargement, la lecture demandée part quand même, avec le son', async () => {
      vi.spyOn(element, 'play').mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
      port.unlock();
      await sleep(20);
      port.load(tone);
      port.playUntil(0.3);

      port.unlock();

      await until('finished');
      expect(port.position()).toBe(0.3);
      expect(element.muted).toBe(false);
    });

    it('un extrait en échec : le silence est rejoué, « Réessayer » rechargera l\'extrait', async () => {
      vi.spyOn(element, 'play').mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
      port.unlock();
      await sleep(20);
      await loaded();
      vi.spyOn(element, 'play').mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
      port.playUntil(0.3);
      await until('error');
      const play = vi.spyOn(element, 'play');
      play.mockClear();

      port.unlock();

      expect(play).toHaveBeenCalledTimes(1);
      expect(element.src).toMatch(/^blob:/);
      expect(port.state()).toBe('error');
      port.load(tone);
      port.playUntil(0.3);
      await until('finished');
      expect(port.position()).toBe(0.3);
    });

    it('un refus encore une fois se retente au clic suivant, même avec un extrait chargé', async () => {
      vi.spyOn(element, 'play').mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
      port.unlock();
      await sleep(20);
      await loaded();
      const play = vi.spyOn(element, 'play');
      play.mockClear();
      play.mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));

      port.unlock();
      await sleep(20);
      expect(element.muted).toBe(false);
      port.unlock();

      expect(play).toHaveBeenCalledTimes(2);
    });
  });
});

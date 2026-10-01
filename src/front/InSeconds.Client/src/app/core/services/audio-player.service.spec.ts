import { TestBed } from '@angular/core/testing';
import { AudioPlayerService } from './audio-player.service';
import { SILENCE_WAV_DATA_URI } from './test-silence-wav';

// Utilise une vraie lecture <audio> (data: URI, pas de dépendance réseau) plutôt que de
// stubber le service : les bugs corrigés ici (M11, M12, piège E4) sont tous des interactions
// avec le vrai élément audio et ses événements, qu'un stub masquerait entièrement.
function waitUntil(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) { resolve(); return; }
      if (Date.now() - start > timeoutMs) { reject(new Error('waitUntil timeout')); return; }
      setTimeout(check, 20);
    };
    check();
  });
}

describe('AudioPlayerService', () => {
  let service: AudioPlayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioPlayerService);
  });

  it('starts idle', () => {
    expect(service.state()).toBe('idle');
    expect(service.isIdle()).toBe(true);
  });

  it('play() passe par loading puis playing puis finished, avec le bon listenedSeconds', async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.1);
    expect(service.state()).toBe('loading');

    await waitUntil(() => service.isFinished());

    expect(service.listenedSeconds()).toBe(0.1);
  });

  // E4 (revue du 25/09) : un échec de chargement ne doit jamais ramener l'état à 'idle' —
  // ça relancerait en boucle l'autoplay de BlindRoundComponent (effect sur isIdle()).
  it("play() avec une source invalide bascule vers l'état 'error', jamais 'idle'", async () => {
    service.play('data:audio/wav;base64,invalide-pas-un-vrai-wav', 0.1);
    expect(service.state()).toBe('loading');

    await waitUntil(() => service.isError());

    expect(service.state()).not.toBe('idle');
  });

  // M11 (revue du 25/09) : appeler extend() pendant le chargement (avant que canplay ait eu
  // lieu) ne doit pas programmer un arrêt sur l'ancienne durée — l'écoute doit aller jusqu'au
  // nouveau palier, pas s'arrêter en cours de route.
  it('extend() appelé pendant loading étend bien la durée réellement écoutée', async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.05);
    // Toujours en 'loading' ici : canplay n'est jamais émis de façon synchrone par load().
    expect(service.state()).toBe('loading');

    service.extend(0.3);

    await waitUntil(() => service.isFinished(), 5000);

    // Si le bug était présent, listenedSeconds resterait à 0.05 (durée programmée avant
    // l'extension, dès l'appel initial de play()).
    expect(service.listenedSeconds()).toBe(0.3);
  });

  // M12 (revue du 25/09) : le bouton de relecture (replayCurrent) ne doit pas faire croire à
  // une nouvelle prolongation — contrairement à play(), il ne réinitialise pas `extended`.
  it("replayCurrent() ne réinitialise pas wasExtended/extended après une prolongation", async () => {
    // Même pattern que le test M11 ci-dessus (extend() pendant 'loading', jamais 'playing') :
    // extended/wasExtended sont posés inconditionnellement en tête d'extend(), avant tout
    // test d'état — pas besoin d'observer un état 'playing' réel (fenêtre trop courte pour un
    // polling fiable en Chrome headless) pour vérifier ce comportement.
    service.play(SILENCE_WAV_DATA_URI, 0.05);
    service.extend(0.1);
    expect(service.extended()).toBe(true);

    await waitUntil(() => service.isFinished());
    expect(service.extended()).toBe(true);

    service.replayCurrent();
    // Posé de façon synchrone par replayCurrent(), avant même que audio.play() ne résolve —
    // fiable même si l'autoplay réel échoue ensuite de façon asynchrone.
    expect(service.state()).toBe('playing');
    // Toujours vrai juste après le replay — la relecture du même palier n'efface pas le fait
    // qu'une prolongation a eu lieu plus tôt sur ce morceau.
    expect(service.extended()).toBe(true);

    const result = service.stop();
    expect(result.wasExtended).toBe(true);
  });

  it('reset() revient à idle et efface les signaux', async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.05);
    service.extend(0.1);
    await waitUntil(() => service.isFinished());

    service.reset();

    expect(service.state()).toBe('idle');
    expect(service.listenedSeconds()).toBe(0);
    expect(service.extended()).toBe(false);
    expect(service.progress()).toBe(0);
  });
});

// Piège 44 CLAUDE.md (palier 1s réduit à 0,5s sur mobile).
describe('AudioPlayerService — arrêt calé sur le son réel', () => {
  let service: AudioPlayerService;
  let el: HTMLAudioElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioPlayerService);
    el = (service as unknown as { audio: HTMLAudioElement }).audio;
  });

  afterEach(() => service.reset());

  /** Comme Safari iOS : `playing` part dès l'appel, le son 400 ms plus tard, sans second `playing`. */
  function simulateIosLatePlaying(): void {
    const realPlay = el.play.bind(el);
    spyOn(el, 'play').and.callFake(() => {
      el.onplaying?.call(el, new Event('playing')); // faux départ, position encore à 0
      el.onplaying = null;                            // le vrai `playing` n'est plus écouté
      return new Promise<void>((resolve, reject) => setTimeout(() => realPlay().then(resolve, reject), 400));
    });
  }

  it('un démarrage lent du son ne raccourcit pas le palier', async () => {
    // Simule un mobile : le son ne sort que 400 ms après l'appel à play(), soit plus que le
    // palier. L'ancien chrono, lancé à l'appel, coupait avant tout son.
    const realPlay = el.play.bind(el);
    spyOn(el, 'play').and.callFake(() =>
      new Promise<void>((resolve, reject) => setTimeout(() => realPlay().then(resolve, reject), 400)));

    let startedAt: number | null = null;
    el.addEventListener('playing', () => { startedAt ??= performance.now(); });

    service.play(SILENCE_WAV_DATA_URI, 0.2);
    await waitUntil(() => service.isFinished(), 5000);

    // L'arrêt se compte à partir du son réellement démarré, pas de l'appel à play().
    expect(startedAt).not.toBeNull();
    expect(performance.now() - startedAt!).toBeGreaterThanOrEqual(190);
  });

  // Piège 46 CLAUDE.md : sur iPhone, `playing` part dès l'appel à play() alors que le son ne
  // démarre que bien plus tard, et aucun second `playing` ne suit. Le chrono lancé sur ce faux
  // départ coupait le palier avant (presque) tout son.
  it('un événement playing émis avant le vrai démarrage du son ne raccourcit pas le palier', async () => {
    simulateIosLatePlaying();

    service.play(SILENCE_WAV_DATA_URI, 0.2);
    await waitUntil(() => service.isFinished(), 5000);

    // Arrêt seulement une fois 0,2 s de média réellement jouées.
    expect(el.currentTime).toBeGreaterThanOrEqual(0.19);
  });

  it('une relecture (↺) joue le palier en entier même si le son tarde à repartir', async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.2);
    await waitUntil(() => service.isFinished());

    simulateIosLatePlaying();

    service.replayCurrent();
    await waitUntil(() => service.isFinished(), 5000);

    expect(el.currentTime).toBeGreaterThanOrEqual(0.19);
  });

  it("un échec de lecture pendant extend() passe en 'error', jamais en 'idle'", async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.05);
    await waitUntil(() => service.isFinished());

    spyOn(el, 'play').and.returnValue(Promise.reject(new DOMException('refusé', 'NotAllowedError')));
    service.extend(0.1);

    await waitUntil(() => service.isError());
    expect(service.state()).not.toBe('idle');
  });

  it('une lecture interrompue par notre propre pause (AbortError) n\'est pas une erreur', async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.05);
    await waitUntil(() => service.isFinished());

    spyOn(el, 'play').and.returnValue(Promise.reject(new DOMException('interrompu', 'AbortError')));
    service.extend(0.1);
    await new Promise(r => setTimeout(r, 50));

    expect(service.isError()).toBe(false);
    expect(service.isIdle()).toBe(false);
  });

  it("un échec de replayFull() termine le round sans repasser par 'idle'", async () => {
    service.play(SILENCE_WAV_DATA_URI, 0.05);
    await waitUntil(() => service.isFinished());

    spyOn(el, 'play').and.returnValue(Promise.reject(new DOMException('refusé', 'NotAllowedError')));
    service.replayFull();
    await new Promise(r => setTimeout(r, 50));

    expect(service.state()).toBe('finished');
  });
});

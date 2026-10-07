import { TestBed } from '@angular/core/testing';
import { RoundConfig } from '../domain/track-round';
import { TrackRoundStore } from './track-round.store';
import { FakeAudioPort, provideFakeAudio } from './testing/fake-audio.port';

const URL = 'https://cdn.example/extrait.mp3';
const NEXT = 'https://cdn.example/suivant.mp3';

const CONFIG: RoundConfig = {
  trackId: 7,
  previewUrl: URL,
  listen: { steps: [0.5, 1, 2, 5, 10], extendable: true },
  hints: { unlockSeconds: [5, 10] },
};

describe('TrackRoundStore', () => {
  let audio: FakeAudioPort;
  let store: InstanceType<typeof TrackRoundStore>;

  beforeEach(() => {
    audio = new FakeAudioPort();
    TestBed.configureTestingModule({ providers: [provideFakeAudio(audio), TrackRoundStore] });
    store = TestBed.inject(TrackRoundStore);
  });

  /** Le lecteur annonce un état ; la manche le suit au prochain passage des effets. */
  function emit(state: Parameters<FakeAudioPort['emit']>[0], position?: number): void {
    audio.emit(state, position);
    TestBed.tick();
  }

  function listenedTo(seconds: number): void {
    store.start(CONFIG);
    emit('ready');
    while (store.chosenSeconds() < seconds) store.listenMore();
    emit('finished', seconds);
  }

  describe('démarrage', () => {
    it('lance l\'écoute toute seule au premier palier, en préchargeant le morceau suivant', () => {
      store.start(CONFIG, NEXT);

      expect(audio.calls).toEqual(['stop', `load ${URL} next ${NEXT}`, 'playUntil 0.5']);
      expect(store.phase()).toBe('loading');
      expect(store.chosenSeconds()).toBe(0.5);
      expect(store.showsInput()).toBe(true);
    });

    it('suit le lecteur : lecture, palier joué', () => {
      store.start(CONFIG);
      emit('playing');
      expect(store.phase()).toBe('playing');
      emit('finished', 0.5);
      expect(store.phase()).toBe('listened');
      expect(store.position()).toBe(0.5);
    });

    it('part du premier palier permis après une reprise', () => {
      store.start({ ...CONFIG, listenedFloor: 2 });
      expect(audio.calls).toContain('playUntil 2');
      expect(store.steps()).toEqual([2, 5, 10]);
    });

    it('un morceau sans extrait ne lance rien et se passe sans confirmation', () => {
      store.start({ ...CONFIG, previewUrl: null });
      expect(audio.calls).toEqual(['stop']);
      expect(store.phase()).toBe('no-preview');
      expect(store.skipUnplayable()).toMatchObject({ trackId: 7, listenedSeconds: 0, artist: null, title: null });
    });

    it('l\'écoute automatique n\'a lieu qu\'une fois : un retour du lecteur au repos ne la relance pas (pièges 33 et 44)', () => {
      store.start(CONFIG);
      emit('playing');
      store.listenMore();
      emit('finished', 1);
      audio.calls.length = 0;

      emit('idle');

      expect(audio.calls).toEqual([]);
      expect(store.phase()).toBe('listened');
      expect(store.chosenSeconds()).toBe(1);
    });

    it('un nouveau morceau remet la manche à zéro et coupe l\'ancien son', () => {
      listenedTo(2);
      audio.calls.length = 0;
      store.start({ ...CONFIG, trackId: 8 });

      expect(audio.calls[0]).toBe('stop');
      expect(store.chosenSeconds()).toBe(0.5);
      expect(store.wasExtended()).toBe(false);
    });
  });

  describe('écouter plus', () => {
    it('relance le lecteur au palier suivant et note la prolongation', () => {
      store.start(CONFIG);
      emit('playing');
      store.listenMore();

      expect(audio.calls.at(-1)).toBe('playUntil 1');
      expect(store.chosenSeconds()).toBe(1);
      expect(store.wasExtended()).toBe(true);
      expect(store.nextStep()).toBe(2);
    });

    it('suit le lecteur qui ne repart pas (extrait déjà joué jusqu\'au bout) : jamais bloquée « en lecture »', () => {
      listenedTo(1);
      expect(store.phase()).toBe('listened');
      store.listenMore(); // le faux lecteur reste `finished`, comme Howler quand l'extrait est fini
      expect(audio.calls.at(-1)).toBe('playUntil 2');
      expect(store.phase()).toBe('listened');
    });

    it('après un palier joué, passe en lecture quand le lecteur repart', () => {
      listenedTo(1);
      store.listenMore();
      emit('playing');
      expect(store.phase()).toBe('playing');
    });

    it('marche pendant le chargement : le lecteur garde le dernier palier demandé (piège 40)', () => {
      store.start(CONFIG);
      store.listenMore();
      store.listenMore();

      expect(store.phase()).toBe('loading');
      expect(audio.calls.slice(-2)).toEqual(['playUntil 1', 'playUntil 2']);
      expect(store.wasExtended()).toBe(true);
    });

    it('s\'arrête au dernier palier', () => {
      listenedTo(10);
      audio.calls.length = 0;
      store.listenMore();
      expect(audio.calls).toEqual([]);
      expect(store.nextStep()).toBeNull();
    });

    it('n\'existe pas quand le mode ne permet pas de prolonger', () => {
      store.start({ ...CONFIG, listen: { steps: [10], extendable: false } });
      audio.calls.length = 0;
      store.listenMore();
      expect(audio.calls).toEqual([]);
      expect(store.nextStep()).toBeNull();
    });
  });

  describe('relecture', () => {
    it('rejoue le palier depuis le début sans effacer la prolongation (piège 40)', () => {
      listenedTo(1);
      store.replay();

      expect(audio.calls.at(-1)).toBe('replay 1');
      expect(store.wasExtended()).toBe(true);
    });

    it('ne fait rien pendant le chargement ni après une erreur', () => {
      store.start(CONFIG);
      audio.calls.length = 0;
      store.replay();
      emit('error');
      store.replay();
      expect(audio.calls).toEqual([]);
    });
  });

  describe('erreur de lecture', () => {
    it('masque la saisie et propose de réessayer, sans jamais relancer seule (piège 33)', () => {
      store.start(CONFIG);
      emit('error');
      audio.calls.length = 0;

      expect(store.phase()).toBe('audio-error');
      expect(store.showsInput()).toBe(false);
      emit('idle');
      expect(store.phase()).toBe('audio-error');
      expect(audio.calls).toEqual([]);
    });

    it('« Réessayer » recharge l\'extrait et repart au palier choisi', () => {
      store.start(CONFIG, NEXT);
      store.listenMore();
      emit('error');
      audio.calls.length = 0;

      store.retryPlayback();

      expect(audio.calls).toEqual([`load ${URL} next ${NEXT}`, 'playUntil 1']);
      expect(store.phase()).toBe('loading');
      expect(store.wasExtended()).toBe(true);
    });

    it('« Réessayer » recharge depuis une adresse fraîche quand le mode sait la redemander (piège 14)', async () => {
      const refresh = vi.fn(() => Promise.resolve('https://cdn.example/frais.mp3'));
      store.start({ ...CONFIG, refreshPreviewUrl: refresh });
      emit('error');
      audio.calls.length = 0;

      store.retryPlayback();
      expect(store.phase()).toBe('loading');

      await vi.waitFor(() => expect(audio.calls).toEqual(['load https://cdn.example/frais.mp3', 'playUntil 0.5']));
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('« Réessayer » garde l\'adresse quand la redemande échoue, et ne relance rien si la manche est finie entre-temps', async () => {
      store.start({ ...CONFIG, refreshPreviewUrl: () => Promise.reject(new Error('réseau')) });
      emit('error');
      audio.calls.length = 0;
      store.retryPlayback();
      await vi.waitFor(() => expect(audio.calls).toEqual([`load ${URL}`, 'playUntil 0.5']));

      let resolve!: (url: string) => void;
      store.start({ ...CONFIG, refreshPreviewUrl: () => new Promise<string>(r => (resolve = r)) });
      emit('error');
      store.retryPlayback();
      store.reset();
      audio.calls.length = 0;
      resolve('https://cdn.example/frais.mp3');
      await Promise.resolve();
      await Promise.resolve();
      expect(audio.calls).toEqual([]);
    });

    it('« Passer » garde le palier déjà annoncé', () => {
      store.start(CONFIG);
      store.listenMore();
      emit('error');

      expect(store.skipUnplayable()).toMatchObject({ listenedSeconds: 1, wasExtended: true, artist: null, title: null });
    });
  });

  describe('indices', () => {
    it('se proposent aux paliers du réglage', () => {
      listenedTo(2);
      expect(store.availableHintLevels()).toEqual([]);
      listenedTo(5);
      expect(store.availableHintLevels()).toEqual([1]);
    });

    it('les indices du back sont affichés tels quels et ne se redemandent pas', () => {
      listenedTo(10);
      store.applyHints(2, [{ kind: 'year', value: '2013' }, { kind: 'artist', value: 'D___ P___' }]);

      expect(store.hintLevel()).toBe(2);
      expect(store.hints()).toHaveLength(2);
      expect(store.availableHintLevels()).toEqual([]);
    });
  });

  describe('réponse', () => {
    it('rend ce qu\'il faut envoyer : palier, prolongation, saisie', () => {
      listenedTo(2);
      const submission = store.submit({ artist: 'Daft Punk', title: 'Get Lucky' });

      expect(submission).toEqual({ trackId: 7, listenedSeconds: 2, wasExtended: true, artist: 'Daft Punk', title: 'Get Lucky' });
      expect(store.phase()).toBe('submitting');
      expect(store.submission()).toEqual(submission);
    });

    it('une saisie vide demande confirmation et n\'envoie rien', () => {
      listenedTo(1);
      expect(store.submit({ artist: null, title: null })).toBeNull();
      expect(store.pendingConfirm()).toBe('empty');
      expect(store.confirm({ artist: null, title: null })).toMatchObject({ artist: null, title: null, listenedSeconds: 1 });
    });

    it('« Passer » : confirmation, puis réponse vide quelle que soit la saisie', () => {
      listenedTo(1);
      store.askSkip();
      expect(store.pendingConfirm()).toBe('skip');
      expect(store.confirm({ artist: 'Daft Punk', title: null })).toMatchObject({ artist: null, title: null });
    });

    it('annuler la confirmation la ferme', () => {
      listenedTo(1);
      store.askSkip();
      store.cancelConfirm();
      expect(store.pendingConfirm()).toBeNull();
      expect(store.phase()).toBe('listened');
    });

    it('un échec d\'envoi garde la saisie ; réessayer renvoie la même réponse', () => {
      listenedTo(1);
      const sent = store.submit({ artist: 'Daft Punk', title: 'Get Lucky' });
      store.submissionFailed();

      expect(store.phase()).toBe('submit-error');
      expect(store.showsInput()).toBe(true);
      expect(store.retrySubmission()).toEqual(sent);
      expect(store.phase()).toBe('submitting');
    });

    it('révéler rejoue l\'extrait en entier', () => {
      listenedTo(1);
      store.submit({ artist: 'Daft Punk', title: 'Get Lucky' });
      store.reveal();

      expect(store.phase()).toBe('revealed');
      expect(audio.calls.at(-1)).toBe('playFull');
      expect(store.showsInput()).toBe(false);
    });

    it('ne rejoue rien après une erreur de lecture, ni pour un morceau sans extrait', () => {
      store.start(CONFIG);
      emit('error');
      store.skipUnplayable();
      audio.calls.length = 0;
      store.reveal();
      expect(audio.calls).toEqual([]);

      store.start({ ...CONFIG, previewUrl: null });
      store.skipUnplayable();
      audio.calls.length = 0;
      store.reveal();
      expect(audio.calls).toEqual([]);
    });
  });

  describe('fin de manche', () => {
    it('reset coupe le son et oublie le morceau', () => {
      listenedTo(1);
      store.reset();

      expect(audio.calls.at(-1)).toBe('stop');
      expect(store.phase()).toBeNull();
    });

    it('détruire le store coupe le son', () => {
      store.start(CONFIG);
      audio.calls.length = 0;
      TestBed.resetTestingModule();
      expect(audio.calls).toEqual(['stop']);
    });
  });
});

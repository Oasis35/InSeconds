import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { FakeAudioPort } from '../../gameplay/data-access/testing/fake-audio.port';
import { RunGameStore } from './run-game.store';
import { COMPARISON, FakeRunsApi, LINK, ME, PLAY, SESSION, TRACK } from './testing/fake-runs-api';
import { setupRunGame } from './testing/run-game-harness';

describe("RunGameStore, lien d'un ami et pseudo de l'invité", () => {
  const h = setupRunGame();
  let api: FakeRunsApi;
  let audio: FakeAudioPort;
  let store: InstanceType<typeof RunGameStore>;
  const { ensureGuest, setGuestPseudo } = h;

  beforeEach(() => {
    ({ api, audio, store } = h.current());
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

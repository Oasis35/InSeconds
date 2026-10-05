import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SessionStore } from '../../core/session/session.store';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, problem } from '../data-access/testing/fake-players-api';
import { query, settle, text, type } from '../testing/dom';
import { configureTokenPage } from './testing/token-page';
import { VerifyPage } from './verify.page';

describe('VerifyPage', () => {
  let api: FakePlayersApi;
  let navigate: ReturnType<typeof vi.spyOn>;

  function render(token: string | null, overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    configureTokenPage(token, api);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    return fixture;
  }

  const confirmButton = (fixture: ReturnType<typeof render>) => query<HTMLButtonElement>(fixture, 'button[type="button"]')!;
  const pseudoInput = (fixture: ReturnType<typeof render>) => query<HTMLInputElement>(fixture, '#login-pseudo')!;

  it('signale un lien incomplet, sans bouton de confirmation', () => {
    const fixture = render(null);

    expect(text(fixture)).toContain('account.verify.missingToken');
    expect(query(fixture, 'button')).toBeNull();
    expect(query<HTMLAnchorElement>(fixture, 'a[href="/account/login"]')).not.toBeNull();
  });

  it('ne consomme pas le lien à l\'ouverture (les scanners d\'emails le pré-visitent)', async () => {
    const fixture = render('jeton');
    await settle(fixture);

    expect(api.verifyMagicLink).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('account.verify.confirm');
  });

  it('confirme au clic puis rejoint l\'accueil pour un compte existant', async () => {
    const fixture = render('jeton');

    confirmButton(fixture).click();
    await settle(fixture);

    expect(api.verifyMagicLink).toHaveBeenCalledWith('jeton', undefined);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('demande le pseudo à la première connexion, puis crée le compte', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
    confirmButton(fixture).click();
    await settle(fixture);

    expect(text(fixture)).toContain('account.verify.pseudoTitle');
    expect(navigate).not.toHaveBeenCalled();

    api.verifyMagicLink.mockResolvedValue({ needsPseudo: false });
    type(pseudoInput(fixture), ' AliceE2E ');
    query<HTMLButtonElement>(fixture, 'button[type="submit"]')!.click();
    await settle(fixture);

    expect(api.verifyMagicLink).toHaveBeenLastCalledWith('jeton', 'AliceE2E');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('refuse un pseudo hors règles sans appeler l\'API', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
    confirmButton(fixture).click();
    await settle(fixture);

    type(pseudoInput(fixture), 'ab');
    query<HTMLButtonElement>(fixture, 'button[type="submit"]')!.click();
    await settle(fixture);

    expect(api.verifyMagicLink).toHaveBeenCalledTimes(1);
    expect(text(fixture)).toContain('account.verify.invalidPseudo');
  });

  it('reste sur le pseudo, avec son message, quand il est déjà pris', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
    confirmButton(fixture).click();
    await settle(fixture);

    api.verifyMagicLink.mockRejectedValue(problem(409, 'players.pseudo_taken'));
    type(pseudoInput(fixture), 'Alice');
    query<HTMLButtonElement>(fixture, 'button[type="submit"]')!.click();
    await settle(fixture);

    expect(text(fixture)).toContain('errors.players.pseudo_taken');
    expect(pseudoInput(fixture)).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('efface le message sur le pseudo dès que le joueur retape', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
    confirmButton(fixture).click();
    await settle(fixture);
    type(pseudoInput(fixture), 'ab');
    query<HTMLButtonElement>(fixture, 'button[type="submit"]')!.click();
    await settle(fixture);
    expect(text(fixture)).toContain('account.verify.invalidPseudo');

    type(pseudoInput(fixture), 'abc');
    await settle(fixture);

    expect(text(fixture)).not.toContain('account.verify.invalidPseudo');
    expect(pseudoInput(fixture).getAttribute('aria-invalid')).toBeNull();
  });

  it('garde le joueur à l’étape du pseudo (saisie conservée) après une panne réseau', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
    confirmButton(fixture).click();
    await settle(fixture);

    api.verifyMagicLink.mockRejectedValue({ isApiException: true, status: 0, response: '' });
    type(pseudoInput(fixture), 'Alice');
    query<HTMLButtonElement>(fixture, 'button[type="submit"]')!.click();
    await settle(fixture);

    expect(pseudoInput(fixture).value).toBe('Alice');
    expect(text(fixture)).toContain('errors.common.network');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('affiche un lien invalide ou expiré avec un retour vers la connexion', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => Promise.reject(problem(400, 'players.invalid_or_expired_token'))) });

    confirmButton(fixture).click();
    await settle(fixture);

    expect(text(fixture)).toContain('errors.players.invalid_or_expired_token');
    expect(query<HTMLAnchorElement>(fixture, 'a[href="/account/login"]')).not.toBeNull();
    expect(query(fixture, 'button')).toBeNull();
  });

  it('laisse réessayer après une panne réseau', async () => {
    const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => Promise.reject({ isApiException: true, status: 0, response: '' })) });

    confirmButton(fixture).click();
    await settle(fixture);

    expect(text(fixture)).toContain('errors.common.network');
    expect(confirmButton(fixture).disabled).toBe(false);
  });

  describe('navigateur déjà connecté (piège 30)', () => {
    it('prévient avant de confirmer qu\'un autre lien ouvre un autre compte', async () => {
      const fixture = render('jeton');
      TestBed.inject(SessionStore).signedIn(linkedPlayer);
      await settle(fixture);

      expect(text(fixture)).toContain('account.verify.alreadyConnected');
    });

    it('rappelle à l\'étape du pseudo que le compte actuel ne sera pas modifié', async () => {
      const fixture = render('jeton', { verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
      TestBed.inject(SessionStore).signedIn(linkedPlayer);
      confirmButton(fixture).click();
      await settle(fixture);

      expect(text(fixture)).toContain('account.verify.newAccountNotice');
    });

    it('n\'avertit pas un invité', async () => {
      const fixture = render('jeton');
      TestBed.inject(SessionStore).signedIn({ ...linkedPlayer, isGuest: true, email: null });
      await settle(fixture);

      expect(text(fixture)).not.toContain('account.verify.alreadyConnected');
    });
  });
});

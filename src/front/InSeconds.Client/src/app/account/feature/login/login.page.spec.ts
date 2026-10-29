import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { FakePlayersApi, fakePlayersApi, problem, providePlayersApiFake } from '../../data-access/testing/fake-players-api';
import { query, settle, text, type } from '../testing/dom';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let api: FakePlayersApi;

  function render(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTranslateService(), providePlayersApiFake(api)],
    });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    return fixture;
  }

  const emailInput = (fixture: ReturnType<typeof render>) => query<HTMLInputElement>(fixture, '#login-email')!;
  const submit = (fixture: ReturnType<typeof render>) => query<HTMLButtonElement>(fixture, 'button[type="submit"]')!.click();

  it('demande le lien pour l\'adresse saisie, sans espaces autour', async () => {
    const fixture = render();

    type(emailInput(fixture), '  alice@example.com ');
    submit(fixture);
    await settle(fixture);

    expect(api.requestMagicLink).toHaveBeenCalledWith('alice@example.com');
  });

  it('affiche toujours le même message de succès, avec l\'adresse saisie, sans formulaire', async () => {
    const fixture = render();

    type(emailInput(fixture), ' alice@example.com ');
    submit(fixture);
    await settle(fixture);

    expect(text(fixture)).toContain('account.login.sentTitle');
    expect(query(fixture, '[data-testid="sent-to"]')?.textContent?.trim()).toBe('alice@example.com');
    expect(query(fixture, 'form')).toBeNull();
  });

  describe('suggestion de domaine', () => {
    it('propose de corriger un domaine mal tapé, sans appeler l\'API', async () => {
      const fixture = render();

      type(emailInput(fixture), 'alice@gmial.com');
      await settle(fixture);

      expect(query(fixture, '[data-testid="email-suggestion"]')).not.toBeNull();
      expect(api.requestMagicLink).not.toHaveBeenCalled();
    });

    it('corrige l\'adresse au toucher', async () => {
      const fixture = render();
      type(emailInput(fixture), 'alice@gmial.com');
      await settle(fixture);

      query<HTMLButtonElement>(fixture, '[data-testid="email-suggestion"]')!.click();
      await settle(fixture);

      expect(emailInput(fixture).value).toBe('alice@gmail.com');
      expect(query(fixture, '[data-testid="email-suggestion"]')).toBeNull();
    });

    it('ne propose rien pour un domaine courant bien tapé', async () => {
      const fixture = render();

      type(emailInput(fixture), 'alice@gmail.com');
      await settle(fixture);

      expect(query(fixture, '[data-testid="email-suggestion"]')).toBeNull();
    });

    it('n\'empêche pas d\'envoyer l\'adresse telle quelle', async () => {
      const fixture = render();

      type(emailInput(fixture), 'alice@gmial.com');
      submit(fixture);
      await settle(fixture);

      expect(api.requestMagicLink).toHaveBeenCalledWith('alice@gmial.com');
    });
  });

  describe('renvoyer le lien', () => {
    afterEach(() => vi.useRealTimers());

    const resendButton = (fixture: ReturnType<typeof render>) => query<HTMLButtonElement>(fixture, '[data-testid="resend-link"]')!;

    it('attend la minute du back avant de permettre le renvoi, puis renvoie à la même adresse', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      const fixture = render();
      type(emailInput(fixture), 'alice@example.com');
      submit(fixture);
      await settle(fixture);

      expect(resendButton(fixture).disabled).toBe(true);
      expect(text(fixture)).toContain('account.login.resendIn');

      vi.advanceTimersByTime(60_000);
      await settle(fixture);
      expect(resendButton(fixture).disabled).toBe(false);

      resendButton(fixture).click();
      await settle(fixture);

      expect(api.requestMagicLink).toHaveBeenCalledTimes(2);
      expect(api.requestMagicLink).toHaveBeenLastCalledWith('alice@example.com');
      expect(text(fixture)).toContain('account.login.resent');
      expect(resendButton(fixture).disabled).toBe(true);
    });
  });

  it('venant de « J\'ai déjà un compte », invite à saisir l\'adresse du compte', () => {
    api = fakePlayersApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideTranslateService(), providePlayersApiFake(api),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ hint: 'existing' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    expect(text(fixture)).toContain('account.login.existingAccountHint');
    expect(text(fixture)).not.toContain('account.login.subtitle');
  });

  it('refuse une adresse invalide sans appeler l\'API', async () => {
    const fixture = render();

    type(emailInput(fixture), 'pas-une-adresse');
    submit(fixture);
    await settle(fixture);

    expect(api.requestMagicLink).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('account.login.invalidEmail');
    expect(emailInput(fixture).getAttribute('aria-invalid')).toBe('true');
  });

  it('refuse une saisie vide', async () => {
    const fixture = render();

    submit(fixture);
    await settle(fixture);

    expect(api.requestMagicLink).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('account.login.invalidEmail');
  });

  it('affiche le message et le code d\'erreur quand l\'envoi est limité (429)', async () => {
    const fixture = render({ requestMagicLink: vi.fn(async () => Promise.reject(problem(429, 'common.too_many_requests'))) });

    type(emailInput(fixture), 'alice@example.com');
    submit(fixture);
    await settle(fixture);

    expect(text(fixture)).toContain('errors.common.too_many_requests');
    expect(query(fixture, '[data-testid="error-code"]')?.textContent).toBe('0123456789abcdef0123456789abcdef');
    expect(query(fixture, 'form')).not.toBeNull();
  });

  it('propose de retourner au jeu', () => {
    const fixture = render();

    expect(query<HTMLAnchorElement>(fixture, 'a[href="/"]')).not.toBeNull();
  });
});

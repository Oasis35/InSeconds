import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { FakePlayersApi, fakePlayersApi, problem, providePlayersApiFake } from '../data-access/testing/fake-players-api';
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

  it('affiche toujours le même message de succès, sans formulaire', async () => {
    const fixture = render();

    type(emailInput(fixture), 'alice@example.com');
    submit(fixture);
    await settle(fixture);

    expect(text(fixture)).toContain('account.login.sent');
    expect(query(fixture, 'form')).toBeNull();
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

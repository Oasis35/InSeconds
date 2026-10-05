import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../data-access/session-loader';
import { FakePlayersApi, fakePlayersApi, problem, providePlayersApiFake } from '../data-access/testing/fake-players-api';
import { query, settle, text } from '../testing/dom';
import { ConfirmEmailPage } from './confirm-email.page';

describe('ConfirmEmailPage', () => {
  let api: FakePlayersApi;

  function render(token: string | null, overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTranslateService(),
        providePlayersApiFake(api),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } } },
      ],
    });
    vi.spyOn(TestBed.inject(SessionLoader), 'reload').mockResolvedValue();
    const fixture = TestBed.createComponent(ConfirmEmailPage);
    fixture.detectChanges();
    return fixture;
  }

  const confirmButton = (fixture: ReturnType<typeof render>) => query<HTMLButtonElement>(fixture, 'button')!;

  it('signale un lien incomplet, sans bouton', () => {
    const fixture = render(null);

    expect(text(fixture)).toContain('account.confirmEmail.missingToken');
    expect(query(fixture, 'button')).toBeNull();
  });

  it('ne consomme pas le lien à l\'ouverture', async () => {
    const fixture = render('jeton');
    await settle(fixture);

    expect(api.confirmEmailChange).not.toHaveBeenCalled();
    expect(confirmButton(fixture)).not.toBeNull();
  });

  it('confirme au clic et affiche la nouvelle adresse', async () => {
    const fixture = render('jeton');

    confirmButton(fixture).click();
    await settle(fixture);

    expect(api.confirmEmailChange).toHaveBeenCalledWith('jeton');
    expect(text(fixture)).toContain('account.confirmEmail.success');
    expect(query(fixture, 'button')).toBeNull();
  });

  it('affiche un lien invalide ou expiré, avec le code d\'erreur', async () => {
    const fixture = render('jeton', { confirmEmailChange: vi.fn(async () => Promise.reject(problem(400, 'players.invalid_or_expired_token'))) });

    confirmButton(fixture).click();
    await settle(fixture);

    expect(text(fixture)).toContain('errors.players.invalid_or_expired_token');
    expect(query(fixture, '[data-testid="error-code"]')).not.toBeNull();
  });

  it('affiche une adresse prise entre-temps et laisse le lien utilisable', async () => {
    const fixture = render('jeton', { confirmEmailChange: vi.fn(async () => Promise.reject(problem(409, 'players.email_taken'))) });

    confirmButton(fixture).click();
    await settle(fixture);

    expect(text(fixture)).toContain('errors.players.email_taken');
    expect(confirmButton(fixture).disabled).toBe(false);
  });

  it('propose de retourner au profil', () => {
    const fixture = render('jeton');

    expect(query<HTMLAnchorElement>(fixture, 'a[href="/account/profile"]')).not.toBeNull();
  });
});

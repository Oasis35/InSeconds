import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../core/session/session.store';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, providePlayersApiFake } from '../data-access/testing/fake-players-api';
import { query, settle, text } from '../testing/dom';
import { BrowserIdComponent } from './browser-id.component';

describe('BrowserIdComponent', () => {
  let api: FakePlayersApi;

  function render(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [provideTranslateService(), providePlayersApiFake(api)] });
    const fixture = TestBed.createComponent(BrowserIdComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('montre les 8 premiers caractères de l\'identifiant du joueur', async () => {
    const fixture = render({ getMe: vi.fn(async () => ({ ...linkedPlayer, id: '8e7082d0-073b-446b-ba44-7e8ec87553ab' })) });
    await settle(fixture);

    expect(query(fixture, '[data-testid="browser-id"]')?.textContent).toBe('8e7082d0');
    expect(api.createGuest).not.toHaveBeenCalled();
  });

  it('crée l\'invité quand le navigateur n\'a aucune identité (POST, jamais un GET)', async () => {
    const guest = { ...linkedPlayer, id: 'aaaaaaaa-0000', isGuest: true, email: null };
    const fixture = render({ getMe: vi.fn<() => Promise<typeof guest | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(guest) });
    await settle(fixture);

    expect(api.createGuest).toHaveBeenCalledTimes(1);
    expect(query(fixture, '[data-testid="browser-id"]')?.textContent).toBe('aaaaaaaa');
  });

  it('copie l\'identifiant complet puis l\'indique', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    const fixture = render({ getMe: vi.fn(async () => linkedPlayer) });
    await settle(fixture);

    query<HTMLButtonElement>(fixture, 'button')!.click();
    await settle(fixture);

    expect(writeText).toHaveBeenCalledWith('p1');
    expect(text(fixture)).toContain('account.browserId.copied');
  });

  it('n\'indique pas « copié » quand le presse-papiers refuse', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('refusé', 'NotAllowedError'));
    const fixture = render({ getMe: vi.fn(async () => linkedPlayer) });
    await settle(fixture);

    query<HTMLButtonElement>(fixture, 'button')!.click();
    await settle(fixture);

    expect(text(fixture)).toContain('account.browserId.copy');
    expect(text(fixture)).not.toContain('account.browserId.copied');
  });

  it('n\'affiche rien tant qu\'aucune identité n\'existe', async () => {
    const fixture = render({ createGuest: vi.fn(async () => Promise.reject(new Error('429'))) });
    await settle(fixture);

    expect(query(fixture, '[data-testid="browser-id"]')).toBeNull();
    expect(TestBed.inject(SessionStore).isKnown()).toBe(false);
  });
});

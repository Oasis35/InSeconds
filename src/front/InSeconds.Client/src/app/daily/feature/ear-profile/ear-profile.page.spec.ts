import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { settle } from '../../../account/feature/testing/dom';
import { EAR_PROFILE, FakeDailyApi, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';
import { EarProfilePage } from './ear-profile.page';

describe('EarProfilePage', () => {
  async function render(fake = new FakeDailyApi()) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([]), providePlayersApiFake(fakePlayersApi()), provideFakeDailyApi(fake)] });
    const fixture = TestBed.createComponent(EarProfilePage);
    await settle(fixture);
    return { fixture, fake, el: fixture.nativeElement as HTMLElement };
  }

  it('montre sa moyenne en tuile de focus, ses chiffres, ses paliers et artiste ou titre', async () => {
    const { el, fake } = await render();

    expect(fake.calls).toEqual(['earProfile 8w']);
    expect(el.querySelector('[data-testid="profile-average"]')?.classList).toContain('tube-amber');
    expect(el.querySelector('[data-testid="profile-trend"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="profile-first-step"]')?.textContent?.trim()).toBe('11');
    expect(el.querySelector('[data-testid="profile-steps"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="profile-split"]')).not.toBeNull();
  });

  it('une autre période relit le profil', async () => {
    const { fixture, el, fake } = await render();

    el.querySelector<HTMLButtonElement>('[data-testid="profile-period-6m"]')!.click();
    await settle(fixture);

    expect(fake.calls.at(-1)).toBe('earProfile 6m');
    expect(el.querySelector('[data-testid="profile-period-6m"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('un navigateur sans identité : le message, pas un chargement sans fin', async () => {
    const fake = new FakeDailyApi();
    fake.earProfile = null;
    const { el } = await render(fake);

    expect(el.querySelector('[data-testid="profile-empty"]')).not.toBeNull();
  });

  it("sans partie sur la période, un message ; en cas d'erreur, l'écran d'erreur", async () => {
    const empty = new FakeDailyApi();
    empty.earProfile = EAR_PROFILE({ gamesPlayed: 0 });
    expect((await render(empty)).el.querySelector('[data-testid="profile-empty"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const failing = new FakeDailyApi();
    failing.earProfile = new Error('panne');
    expect((await render(failing)).el.querySelector('app-status-screen')).not.toBeNull();
  });
});

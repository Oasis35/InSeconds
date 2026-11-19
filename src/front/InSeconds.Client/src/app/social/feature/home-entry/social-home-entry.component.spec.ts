import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { MemoryStoragePort, StoragePort } from '../../../core/storage/storage.port';
import { LastGroup } from '../../data-access/last-group';
import { DAILY_REVEALED, FakeSocialApi, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { SocialHomeEntryComponent } from './social-home-entry.component';

describe('SocialHomeEntryComponent', () => {
  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });

  let api: FakeSocialApi;

  beforeEach(() => {
    api = new FakeSocialApi();
  });

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(signedIn: SessionPlayer | null, options: { lastGroup?: number; dailyDone?: boolean } = {}) {
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideRouter([]), { provide: StoragePort, useValue: new MemoryStoragePort() }],
    });
    // Le client de l'API est fourni par le composant lui-même (chargé à la demande) : le test le remplace là.
    TestBed.overrideComponent(SocialHomeEntryComponent, { set: { providers: [provideFakeSocialApi(api)] } });
    if (options.lastGroup !== undefined) TestBed.inject(LastGroup).set(options.lastGroup);
    TestBed.inject(ShellChromeStore).setDailyDone(options.dailyDone ?? false);
    const session = TestBed.inject(SessionStore);
    if (signedIn) session.signedIn(signedIn);
    session.markLoaded();
    const fixture = TestBed.createComponent(SocialHomeEntryComponent);
    await settle(fixture);
    return fixture;
  }

  const card = (fixture: ComponentFixture<unknown>) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="friends-card"]');

  it('un invité : la carte « Créer un compte », sans rien demander au serveur', async () => {
    const fixture = await render(player(true));

    expect(card(fixture)?.dataset['kind']).toBe('guest');
    expect(api.calls).toEqual([]);
  });

  it('un visiteur encore inconnu est traité en invité', async () => {
    const fixture = await render(null);

    expect(card(fixture)?.dataset['kind']).toBe('guest');
  });

  it('un compte sans groupe : « Créer un groupe »', async () => {
    api.groups = { groups: [], maxGroups: 5 };

    const fixture = await render(player(false));

    expect(card(fixture)?.dataset['kind']).toBe('no_group');
    expect(api.calls).toEqual(['myGroups']);
  });

  it('un membre, défi à faire : qui a joué dans son premier groupe, sans scores', async () => {
    const fixture = await render(player(false));

    expect(card(fixture)?.dataset['kind']).toBe('pending');
    expect(api.calls).toEqual(['myGroups', 'scores:4']);
  });

  it('un membre de plusieurs groupes : le dernier regardé au classement', async () => {
    await render(player(false), { lastGroup: 7 });

    expect(api.calls).toEqual(['myGroups', 'scores:7']);
  });

  it('le défi du jour fini : la carte se relit et montre le classement du jour', async () => {
    const fixture = await render(player(false));
    expect(card(fixture)?.dataset['kind']).toBe('pending');

    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY_REVEALED });
    TestBed.inject(ShellChromeStore).setDailyDone(true);
    await settle(fixture);

    expect(card(fixture)?.dataset['kind']).toBe('revealed');
    expect(api.calls).toEqual(['myGroups', 'scores:4', 'myGroups', 'scores:4']);
  });

  it('une erreur ne montre rien', async () => {
    api.failScores = true;

    const fixture = await render(player(false));

    expect(card(fixture)).toBeNull();
  });
});

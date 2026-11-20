import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { MemoryStoragePort, StoragePort } from '../../../core/storage/storage.port';
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { LastGroup } from '../../data-access/last-group';
import { DAILY, DAILY_LOCKED, FakeSocialApi, GROUP, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { SocialHomeEntryComponent } from './social-home-entry.component';

describe('SocialHomeEntryComponent', () => {
  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });

  let api: FakeSocialApi;

  beforeEach(() => {
    api = new FakeSocialApi();
    // Défi à faire : qui a joué, sans score, dans les deux groupes.
    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY_LOCKED });
    api.scoresByGroup.set(7, { groupId: 7, name: 'Famille', daily: DAILY_LOCKED });
  });

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(signedIn: SessionPlayer | null, options: { lastGroup?: number; dailyDone?: boolean; accountCta?: boolean; announceOpen?: boolean } = {}) {
    const storage = new MemoryStoragePort();
    // L'annonce des groupes est fermée d'office (elle cache la carte d'un invité et d'un compte sans groupe) : sauf `announceOpen`.
    if (!options.announceOpen) storage.set('inseconds.announce.groups.closed', '1');
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideRouter([]), { provide: StoragePort, useValue: storage }],
    });
    // Le client de l'API est fourni par le composant lui-même (chargé à la demande) : le test le remplace là.
    TestBed.overrideComponent(SocialHomeEntryComponent, { set: { providers: [provideFakeSocialApi(api)] } });
    if (options.lastGroup !== undefined) TestBed.inject(LastGroup).set(options.lastGroup);
    TestBed.inject(ShellChromeStore).setDailyDone(options.dailyDone ?? false);
    TestBed.inject(ShellChromeStore).setAccountCtaShown(options.accountCta ?? false);
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

  it("annonce ouverte : un invité et un compte sans groupe n'ont pas la carte (l'annonce dit déjà la même chose), un membre l'a", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    try {
      const guest = await render(player(true), { announceOpen: true });
      expect(card(guest)).toBeNull();
      TestBed.resetTestingModule();

      api.groups = { groups: [], maxGroups: 5 };
      const noGroup = await render(player(false), { announceOpen: true });
      expect(card(noGroup)).toBeNull();
      TestBed.resetTestingModule();

      api.groups = { groups: [GROUP], maxGroups: 5 };
      api.scoresByGroup.set(GROUP.id, { groupId: GROUP.id, name: 'Potes', daily: DAILY_LOCKED });
      const member = await render(player(false), { announceOpen: true });
      expect(card(member)?.dataset['kind']).toBe('pending');
    } finally {
      vi.useRealTimers();
    }
  });

  it("elle donne les groupes à l'annonce ; carte d'annonce fermée, un compte sans groupe voit la pastille « Nouveau »", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    try {
      api.groups = { groups: [], maxGroups: 5 };
      const fixture = await render(player(false), { announceOpen: true });
      const announce = TestBed.inject(GroupsAnnounce);
      const pill = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="friends-card-new"]');
      expect(announce.groups()).toEqual([]);
      expect(pill()).toBeNull();

      announce.close();
      fixture.detectChanges();
      expect(pill()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
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

    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY });
    TestBed.inject(ShellChromeStore).setDailyDone(true);
    await settle(fixture);

    expect(card(fixture)?.dataset['kind']).toBe('revealed');
    expect(api.calls).toEqual(['myGroups', 'scores:4', 'myGroups', 'scores:4']);
  });

  it('une erreur ne montre rien, pas même la place gardée', async () => {
    api.scoresByGroup.delete(4);

    const fixture = await render(player(false));

    expect(card(fixture)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="friends-card-placeholder"]')).toBeNull();
  });

  it("garde la place de la carte pendant qu'elle se lit", async () => {
    let release!: () => void;
    const myGroups = api.myGroups.bind(api);
    api.myGroups = () => new Promise(resolve => { release = () => resolve(myGroups()); });

    const fixture = await render(player(false));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="friends-card-placeholder"]')).not.toBeNull();
    expect(card(fixture)).toBeNull();

    release();
    await settle(fixture);
    expect(element.querySelector('[data-testid="friends-card-placeholder"]')).toBeNull();
    expect(card(fixture)?.dataset['kind']).toBe('pending');
  });

  it("un invité dont le jeu du jour montre déjà un appel à créer un compte : la carte sans son bouton", async () => {
    const fixture = await render(player(true), { accountCta: true });

    expect(card(fixture)?.dataset['kind']).toBe('guest');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="friends-card-login"]')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { MemoryStoragePort, StoragePort } from '../../../core/storage/storage.port';
import { ShareService } from '../../../core/share/share.service';
import { GroupShare } from '../../data-access/group-share';
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { LastGroup } from '../../data-access/last-group';
import { DAILY, DAILY_LOCKED, FakeSocialApi, GROUP, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { SocialHomeEntryComponent } from './social-home-entry.component';

describe('SocialHomeEntryComponent', () => {
  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });

  let api: FakeSocialApi;
  let shared: string[];

  beforeEach(() => {
    api = new FakeSocialApi();
    shared = [];
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
      providers: [
        provideTranslateService(), provideRouter([]), { provide: StoragePort, useValue: storage },
        { provide: ShareService, useValue: { share: (text: string) => { shared.push(text); return Promise.resolve('copied'); } } },
      ],
    });
    // Le client de l'API est fourni par le composant lui-même (chargé à la demande) : le test le remplace là.
    TestBed.overrideComponent(SocialHomeEntryComponent, { set: { providers: [provideFakeSocialApi(api), GroupShare] } });
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
      TestBed.resetTestingModule();

      // Annonce fermée : la carte revient pour un invité.
      const closed = await render(player(true));
      expect(card(closed)?.dataset['kind']).toBe('guest');
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

  const chip = (fixture: ComponentFixture<unknown>, groupId: number) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="friends-card-group-${groupId}"]`);
  const title = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="friends-card-title"]')?.textContent?.trim();

  it('dans plusieurs groupes : une pastille chacun, celle du groupe montré marquée', async () => {
    const fixture = await render(player(false));

    expect(chip(fixture, 4)?.getAttribute('aria-pressed')).toBe('true');
    expect(chip(fixture, 7)?.getAttribute('aria-pressed')).toBe('false');
  });

  it("dans un seul groupe : aucune pastille", async () => {
    api.groups = { groups: [api.groups.groups[0]], maxGroups: 5 };

    const fixture = await render(player(false));

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="friends-card-groups"]')).toBeNull();
  });

  const newGroup = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="friends-card-new-group"]');

  it('un membre sous le maximum de groupes : « Créer un nouveau groupe » ; au maximum, plus rien', async () => {
    expect(newGroup(await render(player(false)))).not.toBeNull();

    TestBed.resetTestingModule();
    api.groups = { ...api.groups, maxGroups: 2 };
    expect(newGroup(await render(player(false)))).toBeNull();
  });

  const inviteButton = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="friends-card-invite"]');

  it("« Inviter un ami » partage le lien du groupe en cours, celui qu'on a choisi, et le dit", async () => {
    const fixture = await render(player(false));
    chip(fixture, 7)?.click();
    await settle(fixture);

    inviteButton(fixture)?.click();
    await settle(fixture);

    expect(shared).toHaveLength(1);
    expect(shared[0]).toContain('/ranking/join/WXYZ6789?utm_source=share');
    expect(inviteButton(fixture)?.textContent).toContain('social.invite.copied');
  });

  /** Les lectures de scores restent en attente jusqu'à `release` : pour jouer les réponses dans l'ordre voulu. */
  function holdScores() {
    const original = api.scores.bind(api);
    const held: { groupId: number; release: () => void }[] = [];
    api.scores = (groupId: number) => new Promise(resolve => { held.push({ groupId, release: () => resolve(original(groupId)) }); });
    return held;
  }

  it("plusieurs touchers de suite : le dernier groupe touché reste, quel que soit l'ordre des réponses", async () => {
    const fixture = await render(player(false));
    const held = holdScores();

    chip(fixture, 7)?.click();
    chip(fixture, 4)?.click();
    held[0].release();
    await settle(fixture);
    held[1].release();
    await settle(fixture);

    expect(held.map(call => call.groupId)).toEqual([7, 4]);
    expect(title(fixture)).toBe('Potes');
    expect(TestBed.inject(LastGroup).get()).toBe(4);
  });

  it("le défi qui se termine pendant la lecture d'une pastille : la carte suit le groupe touché, et garde ses groupes", async () => {
    api.scoresByGroup.set(7, { groupId: 7, name: 'Famille', daily: DAILY });
    const fixture = await render(player(false));
    const held = holdScores();

    chip(fixture, 7)?.click();
    TestBed.inject(ShellChromeStore).setDailyDone(true);
    await settle(fixture);
    held.slice(1).forEach(call => call.release());
    await settle(fixture);
    held[0].release();
    await settle(fixture);

    expect(card(fixture)?.dataset['kind']).toBe('revealed');
    expect(title(fixture)).toBe('social.home.todayTitle');
    expect(chip(fixture, 7)?.getAttribute('aria-pressed')).toBe('true');
    expect(newGroup(fixture)).not.toBeNull();
  });

  it("une pastille dont la lecture échoue pendant que la carte se relit : la carte revient au groupe d'avant", async () => {
    const fixture = await render(player(false));
    const original = api.scores.bind(api);
    api.scores = (groupId: number) => (groupId === 7 ? Promise.reject(new Error('down')) : original(groupId));

    chip(fixture, 7)?.click();
    await settle(fixture);

    expect(title(fixture)).toBe('Potes');
    expect(TestBed.inject(LastGroup).get()).toBe(4);
  });

  it("le groupe touché pendant que la carte se relit, puis sa lecture en échec : la carte garde le groupe déjà lu, elle ne disparaît pas", async () => {
    const fixture = await render(player(false));
    const held: { groupId: number; resolve: (scores: Awaited<ReturnType<typeof api.scores>>) => void; reject: () => void }[] = [];
    api.scores = (groupId: number) => new Promise((resolve, reject) => held.push({ groupId, resolve, reject: () => reject(new Error('down')) }));

    TestBed.inject(ShellChromeStore).setDailyDone(true);
    await settle(fixture);
    chip(fixture, 7)?.click();
    held[0].resolve({ groupId: 4, name: 'Potes', daily: DAILY });
    await settle(fixture);
    held.slice(1).forEach(call => call.reject());
    await settle(fixture);

    expect(card(fixture)).not.toBeNull();
    expect(chip(fixture, 4)?.getAttribute('aria-pressed')).toBe('true');
    expect(TestBed.inject(LastGroup).get()).toBe(4);
  });

  it("une déconnexion pendant la lecture d'une pastille : la carte invité reste, jamais les scores du groupe", async () => {
    const fixture = await render(player(false));
    const held = holdScores();

    chip(fixture, 7)?.click();
    TestBed.inject(SessionStore).signedOut();
    await settle(fixture);
    held[0].release();
    await settle(fixture);

    expect(card(fixture)?.dataset['kind']).toBe('guest');
  });

  it("annonce ouverte : un membre n'a pas, sur la carte amis, le lien « Créer un nouveau groupe » que l'annonce porte déjà", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    try {
      const fixture = await render(player(false), { announceOpen: true });

      expect(card(fixture)?.dataset['kind']).toBe('pending');
      expect(newGroup(fixture)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("une pastille touchée : la carte passe à ce groupe, qui n'est lu que lui, et il devient le dernier regardé", async () => {
    const fixture = await render(player(false));

    chip(fixture, 7)?.click();
    await settle(fixture);

    expect(title(fixture)).toBe('Famille');
    expect(chip(fixture, 7)?.getAttribute('aria-pressed')).toBe('true');
    expect(api.calls).toEqual(['myGroups', 'scores:4', 'scores:7']);
    expect(TestBed.inject(LastGroup).get()).toBe(7);
  });

  it('le groupe choisi reste celui que la carte relit quand le défi se termine', async () => {
    const fixture = await render(player(false));
    chip(fixture, 7)?.click();
    await settle(fixture);

    TestBed.inject(ShellChromeStore).setDailyDone(true);
    await settle(fixture);

    expect(api.calls).toEqual(['myGroups', 'scores:4', 'scores:7', 'myGroups', 'scores:7']);
  });

  it('un échec de lecture du groupe touché garde la carte sur le groupe précédent', async () => {
    const fixture = await render(player(false));
    api.scoresByGroup.delete(7);

    chip(fixture, 7)?.click();
    await settle(fixture);

    expect(title(fixture)).toBe('Potes');
    expect(chip(fixture, 4)?.getAttribute('aria-pressed')).toBe('true');
    expect(TestBed.inject(LastGroup).get()).toBe(4);
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

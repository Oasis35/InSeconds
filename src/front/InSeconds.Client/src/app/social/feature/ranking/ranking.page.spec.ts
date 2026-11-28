import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { ShareService } from '../../../core/share/share.service';
import { MemoryStoragePort, StoragePort } from '../../../core/storage/storage.port';
import { ModalService } from '../../../ui/modal/modal.service';
import { ManageGroupSheet } from './manage-group.sheet';
import { PendingInvite } from '../../data-access/pending-invite';
import { DAILY, DAILY_LOCKED, FakeSocialApi, GROUP, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { signIn } from '../testing/session';
import { RankingPage } from './ranking.page';
import { flushMicrotasks } from '../../../core/testing/settle';

describe('RankingPage', () => {
  let api: FakeSocialApi;
  let shared: string[];
  let confirm: boolean;
  /** Le pseudo que le créateur choisit dans la feuille « Quitter » ; `null` : il renonce. */
  let successor: string | null;
  let confirmed: { title: string; body: string }[];
  /** Ce que le créateur choisit dans « Gérer le groupe » (renommer ou changer de créateur). */
  let manageChoice: 'rename' | 'transfer' | null;

  async function render(url = '/ranking', who: 'account' | 'guest' | 'nobody' = 'account', pending: string | null = null, survie = true, dailyDone: boolean | null = null) {
    api ??= new FakeSocialApi();
    shared = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([{ path: 'ranking', component: RankingPage }, { path: '**', children: [] }]), provideFakeSocialApi(api),
        { provide: ShareService, useValue: { share: (text: string) => { shared.push(text); return Promise.resolve('copied'); } } },
        {
          provide: ModalService,
          useValue: {
            confirm: (data: { title: string; body: string }) => { confirmed.push(data); return Promise.resolve(confirm); },
            openSheet: (component: unknown) => ({ closed: of(component === ManageGroupSheet ? manageChoice : successor) }),
          },
        },
        // Un stockage neuf par test : le dernier groupe regardé ne passe pas d'un test à l'autre.
        { provide: StoragePort, useValue: new MemoryStoragePort() },
      ],
    });
    const invite = TestBed.inject(PendingInvite);
    invite.clear();
    if (pending) invite.set(pending);
    TestBed.inject(ShellChromeStore).setSurvie(survie);
    TestBed.inject(ShellChromeStore).setDailyDone(dailyDone);
    signIn(who);
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(RankingPage);
    const settle = async () => {
      fixture.detectChanges();
      await flushMicrotasks();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    return { fixture, el: fixture.nativeElement as HTMLElement, settle };
  }

  const find = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    api = new FakeSocialApi();
    confirm = true;
    successor = null;
    confirmed = [];
    manageChoice = null;
  });
  afterEach(() => TestBed.inject(PendingInvite).clear());

  it('ouvre le classement général par sa pastille, même sans groupe', async () => {
    api.groups = { groups: [], maxGroups: 5 };
    const { el } = await render('/ranking?view=general');

    expect(find(el, 'ranking-general')?.getAttribute('aria-current')).toBe('page');
    expect(find(el, 'ranking-general')?.getAttribute('href')).toBe('/ranking?view=general');
    expect(find(el, 'general-ranking')).not.toBeNull();
    expect(find(el, 'ranking-new-group')?.getAttribute('href')).toBe('/ranking/new');
    expect(find(el, 'ranking-new-group')?.textContent).toContain('social.empty.create');
    expect(find(el, 'ranking-empty')).toBeNull();
  });

  it("sans l'accès Survie, pas de pastille « Général », même demandée par l'adresse : seulement les groupes", async () => {
    const { el } = await render('/ranking?view=general', 'account', null, false);

    expect(find(el, 'ranking-general')).toBeNull();
    expect(find(el, 'general-ranking')).toBeNull();
  });

  it('garde la pastille « Général » éteinte sur le classement d\'un groupe', async () => {
    const { el } = await render();

    expect(find(el, 'ranking-general')?.getAttribute('aria-current')).toBeNull();
    expect(find(el, 'general-ranking')).toBeNull();
  });

  it('montre mes groupes en pastilles et la semaine du premier au Défi du jour', async () => {
    const { el } = await render();

    const chips = [...el.querySelectorAll('[data-testid="ranking-group"]')];
    expect(chips.map(chip => chip.textContent?.trim())).toEqual(['Potes', 'Famille']);
    expect(chips[0].getAttribute('aria-current')).toBe('page');
    expect(chips[1].getAttribute('href')).toBe('/ranking?group=7');
    expect(find(el, 'ranking-new-group')?.getAttribute('href')).toBe('/ranking/new');
    expect(find(el, 'ranking-period-week')?.getAttribute('aria-current')).toBe('page');
    expect(el.querySelectorAll('[data-testid="score-row"]')).toHaveLength(3);
    expect(el.querySelectorAll('[data-testid="score-day"]')).toHaveLength(21);
    expect(api.calls).toEqual(['myGroups', 'scores:4']);
  });

  it('ouvre le groupe de l\'adresse', async () => {
    const { el } = await render('/ranking?group=7');

    expect(api.calls).toEqual(['myGroups', 'scores:7']);
    expect(el.querySelectorAll('[data-testid="score-row"]')).toHaveLength(1);
  });

  it('« Aujourd\'hui » après son défi : le classement du jour, sans points de semaine', async () => {
    const { el } = await render('/ranking?period=today');

    expect(find(el, 'ranking-period-today')?.getAttribute('aria-current')).toBe('page');
    expect([...el.querySelectorAll('[data-testid="score-value"]')].map(value => value.textContent?.trim())).toEqual(['900', '600']);
    expect(find(el, 'score-days')).toBeNull();
    expect(find(el, 'today-locked')).toBeNull();
    // Changer de groupe garde l'onglet.
    expect(el.querySelectorAll('[data-testid="ranking-group"]')[1].getAttribute('href')).toBe('/ranking?group=7&period=today');
  });

  it('« Aujourd\'hui » avant son défi : fermé, qui a joué sans score, et « Jouer le défi »', async () => {
    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY_LOCKED });
    const { el } = await render('/ranking?period=today');

    expect(find(el, 'today-locked')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="today-member"][data-played="true"]')).toHaveLength(1);
    expect(find(el, 'score-value')).toBeNull();
    expect(find(el, 'ranking-play')?.getAttribute('href')).toBe('/daily');
    expect(find(el, 'today-locked-reason')?.textContent?.trim()).toBe('social.scores.locked');
  });

  it('« Aujourd\'hui » fermé alors que le défi est joué (abandonné sans réponse) : le dire, sans bouton vers un défi clos', async () => {
    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY_LOCKED });
    const { el } = await render('/ranking?period=today', 'account', null, true, true);

    expect(find(el, 'today-locked-reason')?.textContent?.trim()).toBe('social.scores.lockedAbandoned');
    expect(find(el, 'ranking-play')).toBeNull();
  });

  it("ne montre jamais le classement d'un autre groupe pendant une lecture", async () => {
    const { el, settle } = await render();
    let release!: () => void;
    const original = api.scores.bind(api);
    api.scores = (groupId: number) => new Promise(resolve => { release = () => resolve(original(groupId)); }) as ReturnType<typeof original>;

    await TestBed.inject(Router).navigateByUrl('/ranking?group=7');
    await settle();
    expect(el.querySelectorAll('[data-testid="score-row"]')).toHaveLength(0);
    expect(find(el, 'ranking-loading')).not.toBeNull();

    release();
    await settle();
    expect(el.querySelectorAll('[data-testid="score-row"]')).toHaveLength(1);
  });

  it("même avec l'accès Survie, deux onglets seulement et jamais le classement par niveau d'un groupe", async () => {
    const { el } = await render('/ranking?period=survie');

    expect(el.querySelectorAll('[data-testid^="ranking-period-"]')).toHaveLength(2);
    expect(find(el, 'ranking-period-week')?.getAttribute('aria-current')).toBe('page');
    expect(find(el, 'ranking-list')).toBeNull();
    expect(api.calls).not.toContain('ranking:4');
  });

  it('seul dans son groupe : pas de classement, l\'invitation à faire venir ses amis', async () => {
    api.groups = { groups: [{ ...GROUP, memberCount: 1 }], maxGroups: 5 };
    const { el } = await render();

    expect(find(el, 'ranking-alone')).not.toBeNull();
    expect(find(el, 'ranking-period-week')).toBeNull();
    expect(find(el, 'score-list')).toBeNull();
    expect(el.querySelectorAll('[data-testid="ranking-invite"]')).toHaveLength(1);
    expect(find(el, 'ranking-leave')).not.toBeNull();
  });

  it('à la limite de groupes, « Créer un nouveau groupe » disparaît', async () => {
    api.groups = { ...api.groups, maxGroups: 2 };

    const { el } = await render();

    expect(find(el, 'ranking-new-group')).toBeNull();
  });

  it('« Inviter un ami » partage le lien du groupe et le dit', async () => {
    const { el, settle } = await render();

    find(el, 'ranking-invite')!.click();
    await settle();

    expect(shared).toHaveLength(1);
    expect(shared[0]).toContain('/ranking/join/ABCD2345?utm_source=share');
    expect(find(el, 'ranking-invite')?.textContent).toContain('social.invite.copied');
  });

  it('un créateur qui laisse d\'autres membres désigne son successeur en partant, puis la liste est relue', async () => {
    const { el, settle } = await render();
    successor = null;
    find(el, 'ranking-leave')!.click();
    await settle();
    expect(api.calls.filter(call => call.startsWith('leave'))).toEqual([]);

    successor = 'Théo';
    find(el, 'ranking-leave')!.click();
    await settle();
    expect(api.calls).toContain('leave:4:Théo');
    expect(confirmed).toEqual([]);
    expect([...el.querySelectorAll('[data-testid="ranking-group"]')].map(chip => chip.textContent?.trim())).toEqual(['Famille']);
  });

  it('le créateur d\'un groupe à plusieurs peut passer la main sans partir', async () => {
    const { el, settle } = await render();
    successor = null;
    manageChoice = 'transfer';
    find(el, 'ranking-manage')!.click();
    await settle();
    expect(api.calls.filter(call => call.startsWith('transfer'))).toEqual([]);

    successor = 'Théo';
    manageChoice = 'transfer';
    find(el, 'ranking-manage')!.click();
    await settle();

    expect(api.calls).toContain('transfer:4:Théo');
    // Il n'est plus créateur : « Gérer le groupe » disparaît, il reste dans le groupe.
    expect(find(el, 'ranking-manage')).toBeNull();
    expect(api.calls.filter(call => call.startsWith('leave'))).toEqual([]);
  });

  it('le créateur renomme son groupe, même seul, et la liste est relue', async () => {
    const { el, settle } = await render();
    successor = 'Les amis';

    manageChoice = 'rename';
    find(el, 'ranking-manage')!.click();
    await settle();

    expect(api.calls).toContain('rename:4:Les amis');
    expect(el.querySelector('[data-testid="ranking-group"]')?.textContent).toContain('Les amis');
  });

  it('« Gérer le groupe » n\'existe pas pour un simple membre', async () => {
    api.groups = { ...api.groups, groups: [{ ...GROUP, isOwner: false }, ...api.groups.groups.slice(1)] };

    expect(find((await render()).el, 'ranking-manage')).toBeNull();
  });

  it('« Gérer le groupe » reste proposé au créateur seul, sans rien d\'autre à faire que renommer', async () => {
    api.groups = { ...api.groups, groups: [{ ...GROUP, memberCount: 1 }, ...api.groups.groups.slice(1)] };
    expect(find((await render()).el, 'ranking-manage')).not.toBeNull();
  });

  it('un simple membre confirme, sans successeur à désigner', async () => {
    api.groups = { ...api.groups, groups: [{ ...GROUP, isOwner: false }, ...api.groups.groups.slice(1)] };
    const { el, settle } = await render();
    confirm = false;
    find(el, 'ranking-leave')!.click();
    await settle();
    expect(api.calls.filter(call => call.startsWith('leave'))).toEqual([]);

    confirm = true;
    successor = null;
    confirmed = [];
    find(el, 'ranking-leave')!.click();
    await settle();
    expect(api.calls).toContain('leave:4');
    expect(confirmed[0].body).toBe('social.leave.body');
  });

  it('le créateur seul prévient que le groupe sera supprimé en partant', async () => {
    api.groups = { ...api.groups, groups: [{ ...GROUP, memberCount: 1 }, ...api.groups.groups.slice(1)] };
    const { el, settle } = await render();
    confirm = true;
    successor = null;
    confirmed = [];

    find(el, 'ranking-leave')!.click();
    await settle();

    expect(confirmed[0].body).toBe('social.leave.lastBody');
    expect(api.calls).toContain('leave:4');
  });

  it('un créateur dont les membres ne sont pas lus ne part pas', async () => {
    api.scoresByGroup.delete(4);
    const { el, settle } = await render();

    find(el, 'ranking-leave')!.click();
    await settle();

    expect(api.calls.filter(call => call.startsWith('leave'))).toEqual([]);
    expect(find(el, 'ranking-leave-failed') ?? el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('sans groupe : « Joue contre tes amis » et « Créer un groupe »', async () => {
    api.groups = { groups: [], maxGroups: 5 };

    const { el } = await render();

    expect(find(el, 'ranking-empty')).not.toBeNull();
    expect(find(el, 'ranking-create')?.getAttribute('href')).toBe('/ranking/new');
    expect(find(el, 'ranking-list')).toBeNull();
  });

  it('un invité ou un visiteur est invité à créer un compte, sans rien demander au serveur', async () => {
    const { el } = await render('/ranking', 'guest');

    expect(find(el, 'ranking-guest')).not.toBeNull();
    expect(find(el, 'ranking-login')?.getAttribute('href')).toBe('/account/login');
    expect(api.calls).toEqual([]);
  });

  it('une invitation en attente est proposée à un compte', async () => {
    const { el } = await render('/ranking', 'account', 'WXYZ6789');

    expect(find(el, 'ranking-pending')?.getAttribute('href')).toBe('/ranking/join/WXYZ6789');
  });

  it('une panne se dit et se réessaie', async () => {
    api.failGroups = true;
    const { el, settle } = await render();
    expect(find(el, 'ranking-error')).not.toBeNull();

    api.failGroups = false;
    el.querySelector<HTMLButtonElement>('[data-testid="ranking-error"] button')!.click();
    await settle();
    expect(find(el, 'score-list')).not.toBeNull();
  });

  it('un classement du groupe en panne se dit et se réessaie, les pastilles restent', async () => {
    api.scoresByGroup.delete(4);
    const { el, settle } = await render();
    expect(find(el, 'ranking-error')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="ranking-group"]')).toHaveLength(2);

    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY });
    el.querySelector<HTMLButtonElement>('[data-testid="ranking-error"] button')!.click();
    await settle();
    expect(find(el, 'score-list')).not.toBeNull();
  });
});

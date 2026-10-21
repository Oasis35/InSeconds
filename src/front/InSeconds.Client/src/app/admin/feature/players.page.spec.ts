import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import {
  FakeAdminPlayersApi, fakeAdminPlayersApi, playerGame, provideAdminPlayersApiFake, registeredPlayer,
} from '../data-access/testing/fake-admin-players-api';
import { problem } from '../data-access/testing/fake-catalogue-api';
import { RegisteredPlayer } from '../domain/registered-player';
import { PlayersPage } from './players.page';

describe('PlayersPage', () => {
  const alice = registeredPlayer({ id: 'a', pseudo: 'Alice', isAdmin: true });
  const bob = registeredPlayer({ id: 'b', pseudo: 'Bob', email: 'bob@test.fr', lastSeenAt: null });

  let api: FakeAdminPlayersApi;

  async function render(options: { players?: RegisteredPlayer[]; api?: Partial<FakeAdminPlayersApi> } = {}) {
    api = fakeAdminPlayersApi({ list: vi.fn(async () => options.players ?? [alice, bob]), ...options.api });
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideAdminPlayersApiFake(api)] });
    const fixture = TestBed.createComponent(PlayersPage);
    const element = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    fixture.detectChanges();
    await settle();
    return { fixture, element, settle, rows: () => element.querySelectorAll('[data-testid="registered-player"]') };
  }

  it('charge la liste à l\'ouverture et affiche une ligne par compte, avec le badge Admin', async () => {
    const { rows } = await render();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('a•••@example.com');
    expect(rows()[0].textContent).not.toContain('alice@example.com');
    expect(rows()[0].textContent).toContain('admin.players.adminBadge');
    expect(rows()[1].textContent).toContain('admin.players.neverSeen');
  });

  it('affiche l\'état vide', async () => {
    const { element } = await render({ players: [] });
    expect(element.textContent).toContain('admin.players.empty');
  });

  it('affiche l\'erreur de chargement', async () => {
    const { element } = await render({ api: { list: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) } });
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('affiche l\'email complet au clic, puis le masque de nouveau', async () => {
    const { settle, rows } = await render();
    const email = rows()[1].querySelector('[data-testid="player-email"]') as HTMLButtonElement;
    expect(email.textContent?.trim()).toBe('b•••@test.fr');

    email.click();
    await settle();
    expect(email.textContent?.trim()).toBe('bob@test.fr');
    expect(email.getAttribute('aria-pressed')).toBe('true');
    expect(rows()[0].textContent).not.toContain('alice@example.com');

    email.click();
    await settle();
    expect(email.textContent?.trim()).toBe('b•••@test.fr');
  });

  it('filtre par pseudo ou email', async () => {
    const { element, settle, rows } = await render();
    const input = element.querySelector('#players-filter-text') as HTMLInputElement;
    input.value = 'bob@';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(rows()).toHaveLength(1);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(element.textContent).toContain('admin.players.noMatch');
  });

  it('déplie l\'historique d\'un joueur puis le replie', async () => {
    const { element, settle, rows } = await render({ api: { history: vi.fn(async () => [playerGame()]) } });
    const button = rows()[0].querySelector('button') as HTMLButtonElement;

    button.click();
    await settle();
    expect(api.history).toHaveBeenCalledWith('a');
    const history = element.querySelector('[data-testid="player-history"]');
    expect(history?.textContent).toContain('admin.players.status.Completed');
    expect(history?.textContent).toContain('3200');

    button.click();
    await settle();
    expect(element.querySelector('[data-testid="player-history"]')).toBeNull();
  });

  it('une seule ligne dépliée à la fois', async () => {
    const { element, settle, rows } = await render();
    (rows()[0].querySelector('button') as HTMLButtonElement).click();
    await settle();
    (rows()[1].querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(element.querySelectorAll('[data-testid="player-history"]')).toHaveLength(1);
    expect(element.querySelector('[data-testid="player-history"]')?.id).toBe('player-history-b');
  });

  it('affiche l\'erreur quand l\'historique ne se lit pas', async () => {
    const { element, settle, rows } = await render({
      api: { history: vi.fn(() => Promise.reject(problem(404, 'common.not_found'))) },
    });
    (rows()[0].querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(element.querySelector('[data-testid="player-history"]')?.textContent).toContain('admin.players.historyError');
  });

  describe('interrupteur du mode Run', () => {
    const toggleOf = (row: Element) => row.querySelector('[data-testid="run-access"]') as HTMLButtonElement;

    it('montre l\'accès d\'office d\'un admin (non modifiable) et celui, lu une fois, des comptes autorisés', async () => {
      const carol = registeredPlayer({ id: 'c', pseudo: 'Carol' });
      const { rows } = await render({ players: [alice, bob, carol], api: { listRunAccess: vi.fn(async () => ['c']) } });
      expect(api.listRunAccess).toHaveBeenCalledTimes(1);
      expect(toggleOf(rows()[0]).getAttribute('aria-checked')).toBe('true');
      expect(toggleOf(rows()[0]).disabled).toBe(true);
      expect(toggleOf(rows()[1]).getAttribute('aria-checked')).toBe('false');
      expect(toggleOf(rows()[2]).getAttribute('aria-checked')).toBe('true');
    });

    it('autorise un compte au clic', async () => {
      const { settle, rows } = await render();
      toggleOf(rows()[1]).click();
      await settle();
      expect(api.setRunAccess).toHaveBeenCalledWith('b', true);
      expect(toggleOf(rows()[1]).getAttribute('aria-checked')).toBe('true');
    });

    it('retire l\'accès au clic sur un interrupteur allumé', async () => {
      const { settle, rows } = await render({ api: { listRunAccess: vi.fn(async () => ['b']) } });
      toggleOf(rows()[1]).click();
      await settle();
      expect(api.setRunAccess).toHaveBeenCalledWith('b', false);
      expect(toggleOf(rows()[1]).getAttribute('aria-checked')).toBe('false');
    });

    it('affiche l\'erreur de l\'API et laisse l\'interrupteur éteint', async () => {
      const { element, settle, rows } = await render({ api: { setRunAccess: vi.fn(() => Promise.reject(problem(404, 'common.not_found'))) } });
      toggleOf(rows()[1]).click();
      await settle();
      expect(element.querySelector('[data-testid="run-access-error"] [role="alert"]')).not.toBeNull();
      expect(toggleOf(rows()[1]).getAttribute('aria-checked')).toBe('false');
    });
  });
});

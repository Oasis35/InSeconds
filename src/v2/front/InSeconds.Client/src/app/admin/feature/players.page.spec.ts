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
    expect(rows()[0].textContent).toContain('alice@example.com');
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
});

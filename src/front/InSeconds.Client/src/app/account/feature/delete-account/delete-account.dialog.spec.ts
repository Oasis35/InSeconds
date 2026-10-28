import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../../core/session/session.store';
import { ProfileStore } from '../../data-access/profile.store';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, problem, providePlayersApiFake } from '../../data-access/testing/fake-players-api';
import { query, settle, text, type } from '../testing/dom';
import { DeleteAccountDialog } from './delete-account.dialog';

describe('DeleteAccountDialog', () => {
  let api: FakePlayersApi;
  let close: ReturnType<typeof vi.fn>;

  async function render(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        providePlayersApiFake(api),
        ProfileStore,
        { provide: DialogRef, useValue: { close, containerInstance: null } },
      ],
    });
    TestBed.inject(SessionStore).signedIn(linkedPlayer);
    const fixture = TestBed.createComponent(DeleteAccountDialog);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof render>>;
  const input = (f: Fixture) => query<HTMLInputElement>(f, '#delete-account-pseudo')!;
  const submit = (f: Fixture) => query<HTMLButtonElement>(f, 'button[type="submit"]')!;

  it('dit ce qui sera effacé et demande de retaper le pseudo', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain('account.profile.delete.body');
    expect(text(fixture)).toContain('account.profile.delete.label');
    expect(submit(fixture).disabled).toBe(true);
  });

  it('n\'active « Supprimer » que pour le bon pseudo (casse et espaces ignorés)', async () => {
    const fixture = await render();

    type(input(fixture), 'Alic');
    fixture.detectChanges();
    expect(submit(fixture).disabled).toBe(true);

    type(input(fixture), ' alice ');
    fixture.detectChanges();
    expect(submit(fixture).disabled).toBe(false);
  });

  it('supprime le compte puis se ferme avec true', async () => {
    const fixture = await render();

    type(input(fixture), 'Alice');
    fixture.detectChanges();
    submit(fixture).click();
    await settle(fixture);

    expect(api.deleteMyAccount).toHaveBeenCalledWith('Alice');
    expect(close).toHaveBeenCalledWith(true);
    expect(TestBed.inject(SessionStore).player()).toBeNull();
  });

  it('reste ouverte et affiche le refus du serveur, sans code technique pour un pseudo refusé', async () => {
    const fixture = await render({ deleteMyAccount: vi.fn(async () => Promise.reject(problem(400, 'players.pseudo_mismatch'))) });

    type(input(fixture), 'Alice');
    fixture.detectChanges();
    submit(fixture).click();
    await settle(fixture);

    expect(close).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('errors.players.pseudo_mismatch');
    expect(query(fixture, '[data-testid="error-code"]')).toBeNull();

    type(input(fixture), 'Alice ');
    await settle(fixture);
    expect(text(fixture)).not.toContain('errors.players.pseudo_mismatch');
  });

  it('montre le code d\'erreur d\'une panne', async () => {
    const fixture = await render({ deleteMyAccount: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

    type(input(fixture), 'Alice');
    fixture.detectChanges();
    submit(fixture).click();
    await settle(fixture);

    expect(query(fixture, '[data-testid="error-code"]')).not.toBeNull();
  });

  it('« Annuler » ferme sans rien supprimer', async () => {
    const fixture = await render();

    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(b => b.textContent?.includes('account.profile.delete.cancel'))!.click();

    expect(close).toHaveBeenCalledWith(false);
    expect(api.deleteMyAccount).not.toHaveBeenCalled();
  });
});

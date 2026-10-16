import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../core/session/session.store';
import { ModalService } from '../../ui/modal/modal.service';
import { ToastService } from '../../ui/toast/toast.service';
import { FakePlayersApi, device, fakePlayersApi, linkedPlayer, problem, providePlayersApiFake } from '../data-access/testing/fake-players-api';
import { query, settle, text, type } from '../testing/dom';
import { ProfilePage } from './profile.page';

describe('ProfilePage', () => {
  const current = device({ id: 1, isCurrent: true });
  const other = device({ id: 2, label: 'Safari · iPhone' });

  let api: FakePlayersApi;
  let confirm: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let toast: ReturnType<typeof vi.spyOn>;

  async function render(overrides: Parameters<typeof fakePlayersApi>[0] = {}, player = linkedPlayer) {
    api = fakePlayersApi({ listDevices: vi.fn(async () => [current, other]), ...overrides });
    confirm = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTranslateService(),
        providePlayersApiFake(api),
        { provide: ModalService, useValue: { confirm } },
      ],
    });
    TestBed.inject(SessionStore).signedIn(player);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    toast = vi.spyOn(TestBed.inject(ToastService), 'show');
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof render>>;
  const pseudoInput = (f: Fixture) => query<HTMLInputElement>(f, '#profile-pseudo')!;
  const emailInput = (f: Fixture) => query<HTMLInputElement>(f, '#profile-email')!;
  const pseudoSave = (f: Fixture) => query<HTMLButtonElement>(f, 'form:first-of-type button[type="submit"]')!;
  const emailSave = (f: Fixture) => query<HTMLButtonElement>(f, 'form:nth-of-type(2) button[type="submit"]')!;
  const buttonLabelled = (f: Fixture, key: string) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes(key))!;

  it('affiche le pseudo et l\'adresse du compte', async () => {
    const fixture = await render();

    expect(pseudoInput(fixture).value).toBe('Alice');
    expect(emailInput(fixture).value).toBe('alice@example.com');
  });

  describe('pseudo', () => {
    it('désactive l\'enregistrement tant que le pseudo est inchangé', async () => {
      const fixture = await render();

      expect(pseudoSave(fixture).disabled).toBe(true);
    });

    it('enregistre un nouveau pseudo et le confirme', async () => {
      const fixture = await render();

      type(pseudoInput(fixture), ' NouveauPseudo ');
      fixture.detectChanges();
      expect(pseudoSave(fixture).disabled).toBe(false);
      pseudoSave(fixture).click();
      await settle(fixture);

      expect(api.updatePseudo).toHaveBeenCalledWith('NouveauPseudo');
      expect(text(fixture)).toContain('account.profile.pseudo.success');
      expect(TestBed.inject(SessionStore).player()?.pseudo).toBe('NouveauPseudo');
    });

    it.each([['ab', 'tooShort'], ['x'.repeat(21), 'tooLong'], ['Bob<>', 'invalid']])(
      'explique pourquoi « %s » est refusé (%s) sans permettre l\'envoi',
      async (pseudo, issue) => {
        const fixture = await render();

        type(pseudoInput(fixture), pseudo);
        fixture.detectChanges();

        expect(text(fixture)).toContain(`account.profile.pseudo.${issue}`);
        expect(pseudoSave(fixture).disabled).toBe(true);
      },
    );

    it('affiche l\'erreur d\'un pseudo déjà pris, qui disparaît quand le joueur retape', async () => {
      const fixture = await render({ updatePseudo: vi.fn(async () => Promise.reject(problem(409, 'players.pseudo_taken'))) });

      type(pseudoInput(fixture), 'Bob');
      fixture.detectChanges();
      pseudoSave(fixture).click();
      await settle(fixture);
      expect(text(fixture)).toContain('errors.players.pseudo_taken');

      type(pseudoInput(fixture), 'Bobby');
      await settle(fixture);
      expect(text(fixture)).not.toContain('errors.players.pseudo_taken');
    });
  });

  describe('changement d\'email', () => {
    it('désactive l\'envoi tant que l\'adresse est inchangée (casse ignorée)', async () => {
      const fixture = await render();
      expect(emailSave(fixture).disabled).toBe(true);

      type(emailInput(fixture), 'ALICE@example.com');
      fixture.detectChanges();
      expect(emailSave(fixture).disabled).toBe(true);
    });

    it('envoie la demande et invite à vérifier la boîte mail', async () => {
      const fixture = await render();

      type(emailInput(fixture), ' nouveau@example.com ');
      fixture.detectChanges();
      emailSave(fixture).click();
      await settle(fixture);

      expect(api.requestEmailChange).toHaveBeenCalledWith('nouveau@example.com');
      expect(text(fixture)).toContain('account.profile.email.sentHint');
    });

    it('refuse une adresse invalide sans permettre l\'envoi', async () => {
      const fixture = await render();

      type(emailInput(fixture), 'pas-une-adresse');
      fixture.detectChanges();

      expect(text(fixture)).toContain('account.profile.email.invalid');
      expect(emailSave(fixture).disabled).toBe(true);
    });

    it('affiche l\'erreur d\'une adresse déjà utilisée', async () => {
      const fixture = await render({ requestEmailChange: vi.fn(async () => Promise.reject(problem(409, 'players.email_taken'))) });

      type(emailInput(fixture), 'autre@example.com');
      fixture.detectChanges();
      emailSave(fixture).click();
      await settle(fixture);

      expect(text(fixture)).toContain('errors.players.email_taken');
    });
  });

  describe('appareils', () => {
    it('liste les appareils connectés', async () => {
      const fixture = await render();

      expect(api.listDevices).toHaveBeenCalledTimes(1);
      expect(query(fixture, '[data-testid="device-1"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="device-2"]')).not.toBeNull();
    });

    it('déconnecte un autre appareil après confirmation', async () => {
      const fixture = await render();

      query<HTMLButtonElement>(fixture, '[data-testid="device-2"] button')!.click();
      await settle(fixture);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(api.revokeDevice).toHaveBeenCalledWith(2);
      expect(query(fixture, '[data-testid="device-2"]')).toBeNull();
      expect(toast).toHaveBeenCalledWith('account.devices.revoked', { tone: 'success' });
    });

    it('ne fait rien si la confirmation est refusée', async () => {
      const fixture = await render();
      confirm.mockResolvedValue(false);

      query<HTMLButtonElement>(fixture, '[data-testid="device-2"] button')!.click();
      await settle(fixture);

      expect(api.revokeDevice).not.toHaveBeenCalled();
      expect(query(fixture, '[data-testid="device-2"]')).not.toBeNull();
    });

    it('déconnecter l\'appareil courant revient à l\'accueil, session vidée', async () => {
      const fixture = await render();

      query<HTMLButtonElement>(fixture, '[data-testid="device-1"] button')!.click();
      await settle(fixture);

      expect(api.revokeDevice).toHaveBeenCalledWith(1);
      expect(TestBed.inject(SessionStore).player()).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('déconnecte tous les autres appareils après confirmation', async () => {
      const fixture = await render();

      buttonLabelled(fixture, 'account.devices.revokeOthers').click();
      await settle(fixture);

      expect(api.revokeOtherDevices).toHaveBeenCalledTimes(1);
      expect(query(fixture, '[data-testid="device-2"]')).toBeNull();
      expect(query(fixture, '[data-testid="device-1"]')).not.toBeNull();
      expect(toast).toHaveBeenCalledWith('account.devices.revokedOthers', { tone: 'success' });
    });

    it('désactive « déconnecter les autres » pendant l\'envoi', async () => {
      let answer!: (revoked: number) => void;
      const fixture = await render({ revokeOtherDevices: vi.fn(() => new Promise<number>(resolve => (answer = resolve))) });

      buttonLabelled(fixture, 'account.devices.revokeOthers').click();
      await settle(fixture);
      expect(buttonLabelled(fixture, 'account.devices.revokeOthers').disabled).toBe(true);

      answer(1);
      await settle(fixture);
      expect(api.revokeOtherDevices).toHaveBeenCalledTimes(1);
    });

    it('n\'offre pas « déconnecter les autres » quand il n\'y en a pas', async () => {
      const fixture = await render({ listDevices: vi.fn(async () => [current]) });

      expect(buttonLabelled(fixture, 'account.devices.revokeOthers')).toBeUndefined();
    });

    it('affiche l\'erreur quand la déconnexion d\'un appareil échoue', async () => {
      const fixture = await render({ revokeDevice: vi.fn(async () => Promise.reject(problem(404, 'common.not_found'))) });

      query<HTMLButtonElement>(fixture, '[data-testid="device-2"] button')!.click();
      await settle(fixture);

      expect(text(fixture)).toContain('errors.common.not_found');
      expect(query(fixture, '[data-testid="device-2"]')).not.toBeNull();
    });

    it('signale un chargement impossible', async () => {
      const fixture = await render({ listDevices: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

      expect(text(fixture)).toContain('account.devices.loadError');
    });
  });

  describe('déconnexion', () => {
    it('demande confirmation, déconnecte puis revient à l\'accueil', async () => {
      const fixture = await render();

      buttonLabelled(fixture, 'account.profile.logout.action').click();
      await settle(fixture);

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
      expect(api.logout).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(SessionStore).player()).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('ne déconnecte pas si la confirmation est refusée', async () => {
      const fixture = await render();
      confirm.mockResolvedValue(false);

      buttonLabelled(fixture, 'account.profile.logout.action').click();
      await settle(fixture);

      expect(api.logout).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('reste sur le profil et affiche l\'erreur quand la déconnexion échoue', async () => {
      const fixture = await render({ logout: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

      buttonLabelled(fixture, 'account.profile.logout.action').click();
      await settle(fixture);

      expect(navigate).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('account.profile.logout.error');
      expect(TestBed.inject(SessionStore).isLinked()).toBe(true);
    });
  });

  describe('identifiant navigateur', () => {
    it('est réservé aux admins', async () => {
      expect(query(await render(), 'app-browser-id')).toBeNull();
    });

    it('s\'affiche pour un admin', async () => {
      const admin = { ...linkedPlayer, isAdmin: true };
      const fixture = await render({ getMe: vi.fn(async () => admin) }, admin);

      expect(query(fixture, 'app-browser-id')).not.toBeNull();
    });
  });
});

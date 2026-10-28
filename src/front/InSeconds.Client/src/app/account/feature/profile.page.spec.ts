import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { FileDownload } from '../../core/download/file-download';
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
  let open: ReturnType<typeof vi.fn>;
  let dialogClosed: Subject<boolean | undefined>;
  let saveText: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let toast: ReturnType<typeof vi.spyOn>;

  async function render(overrides: Parameters<typeof fakePlayersApi>[0] = {}, player = linkedPlayer) {
    api = fakePlayersApi({ listDevices: vi.fn(async () => [current, other]), ...overrides });
    confirm = vi.fn(async () => true);
    dialogClosed = new Subject<boolean | undefined>();
    open = vi.fn(() => ({ closed: dialogClosed }));
    saveText = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTranslateService(),
        providePlayersApiFake(api),
        { provide: ModalService, useValue: { confirm, open } },
        { provide: FileDownload, useValue: { saveText } },
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
  const devicesToggle = (f: Fixture) => query<HTMLButtonElement>(f, '[data-testid="devices-toggle"]')!;
  async function openDevices(f: Fixture) {
    devicesToggle(f).click();
    await settle(f);
  }

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
    it('replie la liste à l\'arrivée : le nombre, cet appareil et les autres sur une ligne', async () => {
      const fixture = await render();

      expect(api.listDevices).toHaveBeenCalledTimes(1);
      expect(devicesToggle(fixture).getAttribute('aria-expanded')).toBe('false');
      expect(query(fixture, '[data-testid="device-list"]')).toBeNull();
      expect(text(fixture)).toContain('account.devices.title · 2');
      expect(query(fixture, '[data-testid="devices-summary"]')?.textContent).toContain('account.devices.summary.one');
      // Le bouton « déconnecter les autres » reste visible sans déplier la liste.
      expect(buttonLabelled(fixture, 'account.devices.revokeOthers')).toBeDefined();
    });

    it('déplie et replie la liste au toucher', async () => {
      const fixture = await render();

      await openDevices(fixture);
      expect(devicesToggle(fixture).getAttribute('aria-expanded')).toBe('true');
      expect(query(fixture, '[data-testid="device-1"]')).not.toBeNull();
      expect(query(fixture, '[data-testid="device-2"]')).not.toBeNull();

      await openDevices(fixture);
      expect(query(fixture, '[data-testid="device-list"]')).toBeNull();
    });

    it.each([
      [[device({ id: 1, isCurrent: true })], 'account.devices.summary.alone'],
      [[device({ id: 1, isCurrent: true }), device({ id: 2 }), device({ id: 3 })], 'account.devices.summary.many'],
    ])('résume la liste repliée selon le nombre d\'autres appareils (%#)', async (devices, key) => {
      const fixture = await render({ listDevices: vi.fn(async () => devices) });

      expect(query(fixture, '[data-testid="devices-summary"]')?.textContent).toContain(key);
    });

    it('déconnecte un autre appareil après confirmation', async () => {
      const fixture = await render();
      await openDevices(fixture);

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
      await openDevices(fixture);

      query<HTMLButtonElement>(fixture, '[data-testid="device-2"] button')!.click();
      await settle(fixture);

      expect(api.revokeDevice).not.toHaveBeenCalled();
      expect(query(fixture, '[data-testid="device-2"]')).not.toBeNull();
    });

    it('déconnecter l\'appareil courant revient à l\'accueil, session vidée', async () => {
      const fixture = await render();
      await openDevices(fixture);

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
      await openDevices(fixture);

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
      await openDevices(fixture);

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

  describe('retour au jeu', () => {
    it('est en haut de la page, avant le titre', async () => {
      const fixture = await render();
      const back = query<HTMLAnchorElement>(fixture, '[data-testid="back-to-game"]')!;

      expect(back.getAttribute('href')).toBe('/');
      expect(back.compareDocumentPosition(query(fixture, 'h1')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('tes données', () => {
    it('viennent après la déconnexion, la suppression en dernier', async () => {
      const fixture = await render();
      const logout = buttonLabelled(fixture, 'account.profile.logout.action');
      const download = buttonLabelled(fixture, 'account.profile.data.export');
      const remove = query(fixture, '[data-testid="delete-account"]')!;

      expect(logout.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(download.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('téléchargent la copie de ses données directement, sans fenêtre', async () => {
      const fixture = await render({
        exportMyData: vi.fn(async () => ({ fileName: 'inseconds-donnees-2026-10-17.json', json: '{"playerId":"p1"}' })),
      });

      buttonLabelled(fixture, 'account.profile.data.export').click();
      await settle(fixture);

      expect(api.exportMyData).toHaveBeenCalledTimes(1);
      expect(saveText).toHaveBeenCalledWith('inseconds-donnees-2026-10-17.json', '{"playerId":"p1"}');
      expect(open).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('affichent l\'erreur quand le téléchargement échoue', async () => {
      const fixture = await render({ exportMyData: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

      buttonLabelled(fixture, 'account.profile.data.export').click();
      await settle(fixture);

      expect(saveText).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('account.profile.data.exportError');
    });

    it('la suppression ouvre la fenêtre, puis revient à l\'accueil avec un message une fois le compte supprimé', async () => {
      const fixture = await render();

      query<HTMLButtonElement>(fixture, '[data-testid="delete-account"]')!.click();
      await settle(fixture);
      expect(open).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();

      dialogClosed.next(true);
      dialogClosed.complete();
      await settle(fixture);

      expect(navigate).toHaveBeenCalledWith('/');
      expect(toast).toHaveBeenCalledWith('account.profile.delete.done', { tone: 'success' });
    });

    it('rien ne se passe si la fenêtre est fermée sans supprimer', async () => {
      const fixture = await render();

      query<HTMLButtonElement>(fixture, '[data-testid="delete-account"]')!.click();
      await settle(fixture);
      dialogClosed.next(undefined);
      dialogClosed.complete();
      await settle(fixture);

      expect(navigate).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    });
  });

  it("n'affiche pas l'identifiant navigateur, même à un admin (il est dans l'admin)", async () => {
    const admin = { ...linkedPlayer, isAdmin: true };
    const fixture = await render({ getMe: vi.fn(async () => admin) }, admin);

    expect(query(fixture, 'app-browser-id')).toBeNull();
  });

  describe('lien admin', () => {
    it("s'affiche en haut de la page pour un admin", async () => {
      const admin = { ...linkedPlayer, isAdmin: true };
      const fixture = await render({ getMe: vi.fn(async () => admin) }, admin);

      expect(query<HTMLAnchorElement>(fixture, '[data-testid="profile-admin"]')?.getAttribute('href')).toBe('/admin');
    });

    it("ne s'affiche pas pour un joueur", async () => {
      const fixture = await render();

      expect(query(fixture, '[data-testid="profile-admin"]')).toBeNull();
    });
  });
});

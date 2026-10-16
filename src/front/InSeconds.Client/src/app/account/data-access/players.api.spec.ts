import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiException, PlayersClient } from '../../api/players/api.generated';
import { PlayersApi } from './players.api';

describe('PlayersApi', () => {
  let client: Record<keyof PlayersClient & string, ReturnType<typeof vi.fn>>;
  let api: PlayersApi;

  beforeEach(() => {
    client = {
      getMe: vi.fn(), createGuest: vi.fn(), requestMagicLink: vi.fn(), verifyMagicLink: vi.fn(), logout: vi.fn(),
      updatePseudo: vi.fn(), requestEmailChange: vi.fn(), confirmEmailChange: vi.fn(), listDevices: vi.fn(),
      revokeDevice: vi.fn(), revokeOtherDevices: vi.fn(),
    } as unknown as typeof client;
    TestBed.configureTestingModule({ providers: [{ provide: PlayersClient, useValue: client }] });
    api = TestBed.inject(PlayersApi);
  });

  describe('getMe', () => {
    it('rend l\'identité du joueur', async () => {
      client.getMe.mockReturnValue(of({ playerId: 'p1', isGuest: false, email: 'a@example.com', pseudo: 'Alice', isAdmin: true }));

      expect(await api.getMe()).toEqual({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true });
    });

    it('rend un invité sans pseudo ni email', async () => {
      client.getMe.mockReturnValue(of({ playerId: 'p2', isGuest: true, email: null, pseudo: undefined, isAdmin: false }));

      expect(await api.getMe()).toEqual({ id: 'p2', pseudo: null, email: null, isGuest: true, isAdmin: false });
    });

    it('rend null quand le navigateur n\'a aucune identité (204, que le client NSwag lève comme une erreur)', async () => {
      client.getMe.mockReturnValue(throwError(() => new ApiException('No Content', 204, '', {}, null)));

      expect(await api.getMe()).toBeNull();
    });

    it('laisse remonter toute autre erreur', async () => {
      const failure = new ApiException('Erreur', 500, '', {}, null);
      client.getMe.mockReturnValue(throwError(() => failure));

      await expect(api.getMe()).rejects.toBe(failure);
    });
  });

  it('crée l\'invité et rend son identifiant', async () => {
    client.createGuest.mockReturnValue(of({ playerId: 'guest-1' }));

    expect(await api.createGuest()).toBe('guest-1');
  });

  it('demande un lien de connexion pour une adresse', async () => {
    client.requestMagicLink.mockReturnValue(of(undefined));

    await api.requestMagicLink('a@example.com');

    expect(client.requestMagicLink).toHaveBeenCalledWith({ email: 'a@example.com' });
  });

  it('confirme un lien de connexion, avec ou sans pseudo', async () => {
    client.verifyMagicLink.mockReturnValue(of({ needsPseudo: true }));

    expect(await api.verifyMagicLink('jeton')).toEqual({ needsPseudo: true });
    expect(client.verifyMagicLink).toHaveBeenLastCalledWith({ token: 'jeton', pseudo: undefined });

    await api.verifyMagicLink('jeton', 'Alice');
    expect(client.verifyMagicLink).toHaveBeenLastCalledWith({ token: 'jeton', pseudo: 'Alice' });
  });

  it('déconnecte ce navigateur', async () => {
    client.logout.mockReturnValue(of(undefined));

    await api.logout();

    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it('renomme le compte et rend le pseudo enregistré', async () => {
    client.updatePseudo.mockReturnValue(of({ pseudo: 'Bob' }));

    expect(await api.updatePseudo('Bob')).toBe('Bob');
    expect(client.updatePseudo).toHaveBeenCalledWith({ pseudo: 'Bob' });
  });

  it('demande un changement d\'email puis le confirme', async () => {
    client.requestEmailChange.mockReturnValue(of(undefined));
    client.confirmEmailChange.mockReturnValue(of({ email: 'nouveau@example.com' }));

    await api.requestEmailChange('nouveau@example.com');
    expect(client.requestEmailChange).toHaveBeenCalledWith({ newEmail: 'nouveau@example.com' });

    expect(await api.confirmEmailChange('jeton')).toBe('nouveau@example.com');
    expect(client.confirmEmailChange).toHaveBeenCalledWith({ token: 'jeton' });
  });

  it('liste les appareils, avec leurs dates converties (le JSON les livre en texte)', async () => {
    client.listDevices.mockReturnValue(of([
      { id: 1, label: 'Chrome · Windows', createdAt: '2026-10-01T08:00:00Z', lastSeenAt: '2026-10-05T10:30:00Z', isCurrent: true },
      { id: 2, label: null, createdAt: '2026-10-02T08:00:00Z', lastSeenAt: '2026-10-04T09:00:00Z', isCurrent: false },
    ]));

    const devices = await api.listDevices();

    expect(devices).toEqual([
      { id: 1, label: 'Chrome · Windows', lastSeenAt: new Date('2026-10-05T10:30:00Z'), isCurrent: true },
      { id: 2, label: null, lastSeenAt: new Date('2026-10-04T09:00:00Z'), isCurrent: false },
    ]);
    expect(devices[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it('déconnecte un appareil, puis tous les autres en rendant leur nombre', async () => {
    client.revokeDevice.mockReturnValue(of(undefined));
    client.revokeOtherDevices.mockReturnValue(of({ revoked: 3 }));

    await api.revokeDevice(7);
    expect(client.revokeDevice).toHaveBeenCalledWith(7);

    expect(await api.revokeOtherDevices()).toBe(3);
  });
});

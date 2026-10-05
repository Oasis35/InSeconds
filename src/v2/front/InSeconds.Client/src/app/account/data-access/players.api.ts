import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiException, DeviceResponse, PlayerMeResponse, PlayersClient } from '../../api/players/api.generated';
import { SessionPlayer } from '../../core/session/session.store';
import { Device } from '../domain/device';

/** Statut de `GET /api/players/me` quand le navigateur n'a aucune identité : NSwag le lève comme une erreur. */
const NO_CONTENT = 204;

/**
 * Adaptateur de l'API du module Players : seule porte d'entrée vers le client généré (`api/players`).
 * Il rend des types du domaine (pas les DTO de l'API) et des promesses ; les erreurs sont celles du
 * client (`toAppError` sait les lire).
 */
@Injectable({ providedIn: 'root' })
export class PlayersApi {
  private readonly client = inject(PlayersClient);

  /** L'identité de ce navigateur, ou `null` s'il n'en a aucune (aucune trace en base). */
  async getMe(): Promise<SessionPlayer | null> {
    let me: PlayerMeResponse;
    try {
      me = await firstValueFrom(this.client.getMe());
    } catch (error) {
      if (error instanceof ApiException && error.status === NO_CONTENT) return null;
      throw error;
    }
    return {
      id: me.playerId,
      pseudo: me.pseudo ?? null,
      email: me.email ?? null,
      isGuest: me.isGuest,
      isAdmin: me.isAdmin,
    };
  }

  /** Crée l'invité de ce navigateur (ou renvoie celui qui existe) et pose son cookie. */
  async createGuest(): Promise<string> {
    return (await firstValueFrom(this.client.createGuest())).playerId;
  }

  async requestMagicLink(email: string): Promise<void> {
    await firstValueFrom(this.client.requestMagicLink({ email }));
  }

  /** Confirme un lien de connexion ; `needsPseudo` : première connexion de cette adresse, le pseudo manque. */
  async verifyMagicLink(token: string, pseudo?: string): Promise<{ readonly needsPseudo: boolean }> {
    const { needsPseudo } = await firstValueFrom(this.client.verifyMagicLink({ token, pseudo }));
    return { needsPseudo };
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.client.logout());
  }

  /** Renomme le compte ; rend le pseudo tel que le serveur l'a enregistré. */
  async updatePseudo(pseudo: string): Promise<string> {
    return (await firstValueFrom(this.client.updatePseudo({ pseudo }))).pseudo;
  }

  async requestEmailChange(newEmail: string): Promise<void> {
    await firstValueFrom(this.client.requestEmailChange({ newEmail }));
  }

  /** Confirme le changement d'email ; rend la nouvelle adresse. */
  async confirmEmailChange(token: string): Promise<string> {
    return (await firstValueFrom(this.client.confirmEmailChange({ token }))).email;
  }

  async listDevices(): Promise<Device[]> {
    return (await firstValueFrom(this.client.listDevices())).map(toDevice);
  }

  async revokeDevice(id: number): Promise<void> {
    await firstValueFrom(this.client.revokeDevice(id));
  }

  /** Déconnecte tous les autres appareils ; rend leur nombre. */
  async revokeOtherDevices(): Promise<number> {
    return (await firstValueFrom(this.client.revokeOtherDevices())).revoked;
  }
}

function toDevice(device: DeviceResponse): Device {
  return {
    id: device.id,
    label: device.label ?? null,
    // Le client généré annonce un `Date` mais le JSON reste du texte : la conversion est faite ici.
    lastSeenAt: new Date(device.lastSeenAt),
    isCurrent: device.isCurrent,
  };
}

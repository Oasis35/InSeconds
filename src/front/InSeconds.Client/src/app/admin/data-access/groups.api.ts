import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminGroupResponse, SocialClient } from '../../api/social/api.generated';
import { AdminGroup } from '../domain/admin-group';

/**
 * Adaptateur de l'onglet Groupes : seule porte vers le client généré de Social pour les routes admin de modération des groupes. Rend des types du
 * domaine ; les erreurs sont celles du client (`toAppError`).
 */
@Injectable()
export class AdminGroupsApi {
  private readonly client = inject(SocialClient);

  /** Tous les groupes, le plus récent d'abord (l'ordre vient de l'API). */
  async list(): Promise<AdminGroup[]> {
    return (await firstValueFrom(this.client.listAdminGroups())).groups.map(toGroup);
  }

  /** Donne un autre nom au groupe et rend le nom enregistré (rogné) ; 400 `social.invalid_name`, 404 `social.group_not_found`. */
  async rename(id: number, name: string): Promise<string> {
    return (await firstValueFrom(this.client.renameAdminGroup(id, { name }))).name;
  }

  /** Remplace un nom inapproprié par le nom de remplacement choisi par l'API et le rend. */
  async resetName(id: number): Promise<string> {
    return (await firstValueFrom(this.client.resetAdminGroupName(id))).name;
  }

  /** Supprime le groupe et ses adhésions (204). */
  async remove(id: number): Promise<void> {
    await firstValueFrom(this.client.deleteAdminGroup(id));
  }
}

function toGroup(g: AdminGroupResponse): AdminGroup {
  return {
    id: g.id,
    name: g.name,
    memberCount: g.memberCount,
    ownerId: g.ownerId,
    ownerPseudo: g.ownerPseudo ?? null,
    createdAt: typeof g.createdAt === 'string' ? g.createdAt : g.createdAt.toISOString(),
  };
}

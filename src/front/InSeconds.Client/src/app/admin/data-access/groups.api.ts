import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminGroupMemberResponse, AdminGroupResponse, SocialClient } from '../../api/social/api.generated';
import { AdminGroup, AdminGroupMember } from '../domain/admin-group';

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

  /** Les membres du groupe, le plus ancien d'abord (l'ordre vient de l'API) ; 404 `social.group_not_found`. */
  async members(id: number): Promise<AdminGroupMember[]> {
    return (await firstValueFrom(this.client.listAdminGroupMembers(id))).members.map(toMember);
  }

  /** Confie le groupe au membre de ce pseudo ; l'ancien créateur devient un simple membre. 400 `social.invalid_successor`. */
  async transferOwner(id: number, pseudo: string): Promise<void> {
    await firstValueFrom(this.client.transferAdminGroupOwner(id, { pseudo }));
  }

  /**
   * Retire le membre de ce pseudo. Pour le créateur d'un groupe qui a d'autres membres, `successor` est le pseudo du nouveau créateur (le changement et
   * le retrait partent ensemble) ; le dernier membre retiré supprime le groupe. 404 `social.member_not_found`, 409 `social.owner_must_hand_over`.
   */
  async removeMember(id: number, pseudo: string, successor: string | null): Promise<void> {
    await firstValueFrom(this.client.removeAdminGroupMember(id, pseudo, successor ?? undefined));
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

function toMember(m: AdminGroupMemberResponse): AdminGroupMember {
  return {
    pseudo: m.pseudo ?? null,
    isOwner: m.isOwner,
    joinedAt: typeof m.joinedAt === 'string' ? m.joinedAt : m.joinedAt.toISOString(),
  };
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

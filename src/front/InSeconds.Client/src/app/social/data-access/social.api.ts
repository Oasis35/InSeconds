import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GroupRankingResponse, GroupSummaryResponse, InvitationResponse, SocialClient } from '../../api/social/api.generated';
import { toAppError } from '../../core/errors/app-error';
import { Group, GroupRanking, Invitation, MyGroups } from '../domain/group';

/** Les refus que les écrans connaissent : ils deviennent des issues, pas des erreurs. */
const REFUSALS = ['account_required', 'invalid_name', 'too_many_groups', 'group_full', 'invitation_not_found', 'group_not_found'] as const;
export type SocialRefusal = (typeof REFUSALS)[number];

/** Une écriture : réussie avec le groupe, refusée pour une raison connue, ou en erreur. */
export type GroupOutcome =
  | { readonly kind: 'ok'; readonly group: Group }
  | { readonly kind: SocialRefusal }
  | { readonly kind: 'error' };

/** L'aperçu d'un lien d'invitation. */
export type InvitationOutcome =
  | { readonly kind: 'ok'; readonly invitation: Invitation }
  | { readonly kind: 'invitation_not_found' }
  | { readonly kind: 'error' };

/**
 * Adaptateur de l'API du module Social : seule porte d'entrée vers le client généré (`api/social`). Il rend des types du domaine (`null` plutôt
 * que `undefined`) et des promesses.
 */
@Injectable()
export class SocialApi {
  private readonly client = inject(SocialClient);

  /** Mes groupes ; vide pour un invité. */
  async myGroups(): Promise<MyGroups> {
    const response = await firstValueFrom(this.client.listMyGroups());
    return { groups: response.groups.map(toGroup), maxGroups: response.maxGroups };
  }

  async ranking(groupId: number): Promise<GroupRanking> {
    return toRanking(await firstValueFrom(this.client.getGroupRanking(groupId)));
  }

  create(name: string): Promise<GroupOutcome> {
    return this.write(() => firstValueFrom(this.client.createGroup({ name: name.trim() })));
  }

  join(inviteCode: string): Promise<GroupOutcome> {
    return this.write(() => firstValueFrom(this.client.joinGroup(inviteCode)));
  }

  async leave(groupId: number): Promise<void> {
    await firstValueFrom(this.client.leaveGroup(groupId));
  }

  async invitation(inviteCode: string): Promise<InvitationOutcome> {
    try {
      return { kind: 'ok', invitation: toInvitation(await firstValueFrom(this.client.getInvitation(inviteCode))) };
    } catch (error) {
      return (await refusalOf(error)) === 'invitation_not_found' ? { kind: 'invitation_not_found' } : { kind: 'error' };
    }
  }

  private async write(call: () => Promise<GroupSummaryResponse>): Promise<GroupOutcome> {
    try {
      return { kind: 'ok', group: toGroup(await call()) };
    } catch (error) {
      return { kind: (await refusalOf(error)) ?? 'error' };
    }
  }
}

async function refusalOf(error: unknown): Promise<SocialRefusal | null> {
  const code = (await toAppError(error)).code;
  return REFUSALS.find(refusal => code === `social.${refusal}`) ?? null;
}

function toGroup(response: GroupSummaryResponse): Group {
  return {
    id: response.id, name: response.name, inviteCode: response.inviteCode,
    memberCount: response.memberCount, maxMembers: response.maxMembers, isOwner: response.isOwner,
  };
}

function toRanking(response: GroupRankingResponse): GroupRanking {
  return {
    groupId: response.groupId,
    name: response.name,
    entries: response.entries.map(entry => ({
      rank: entry.rank ?? null, pseudo: entry.pseudo, isMe: entry.isMe, points: entry.points ?? null, badge: entry.badge ?? null,
    })),
  };
}

function toInvitation(response: InvitationResponse): Invitation {
  return {
    groupName: response.groupName, memberCount: response.memberCount, maxMembers: response.maxMembers,
    isFull: response.isFull, alreadyMember: response.alreadyMember,
  };
}

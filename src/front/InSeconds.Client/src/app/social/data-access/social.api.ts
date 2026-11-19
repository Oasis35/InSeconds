import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  GroupRankingResponse, GroupScoresResponse, GroupSummaryResponse, InvitationResponse, ModeScoresResponse, RankingEntryResponse, RankingIdentityResponse,
  SocialClient,
} from '../../api/social/api.generated';
import { toAppError } from '../../core/errors/app-error';
import { GeneralRanking, Group, GroupRanking, Invitation, MyGroups, RankingEntry, RankingIdentity } from '../domain/group';
import { DAILY_MODE, GroupScores, ModeScores } from '../domain/group-scores';

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

  /** Les scores du Défi du jour d'un de mes groupes : le jour (les scores seulement si j'ai fini ma partie) et la semaine glissante. */
  async scores(groupId: number): Promise<GroupScores> {
    return toScores(await firstValueFrom(this.client.getGroupScores(groupId)));
  }

  /** Le classement général : la tête, ma place et le nom sous lequel j'y apparais. */
  async generalRanking(): Promise<GeneralRanking> {
    const response = await firstValueFrom(this.client.getGeneralRanking());
    return {
      top: response.top.map(toEntry), around: response.around.map(toEntry), total: response.total,
      hasAccount: response.hasAccount, identity: response.identity ? toIdentity(response.identity) : null,
    };
  }

  /** Apparaître sous son pseudo ou sous un alias musical (tiré s'il n'en a pas) ; un compte seulement. */
  async setRankingIdentity(mode: 'pseudo' | 'alias'): Promise<RankingIdentity> {
    return toIdentity(await firstValueFrom(this.client.setRankingIdentity({ mode })));
  }

  /** « Autre alias » : un nouvel alias, toujours libre. */
  async drawRankingAlias(): Promise<RankingIdentity> {
    return toIdentity(await firstValueFrom(this.client.drawRankingAlias()));
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
    entries: response.entries.map(toEntry),
  };
}

function toScores(response: GroupScoresResponse): GroupScores {
  const daily = response.modes.find(mode => mode.mode === DAILY_MODE);
  return { groupId: response.groupId, name: response.name, daily: daily ? toModeScores(daily) : null };
}

function toModeScores(mode: ModeScoresResponse): ModeScores {
  return {
    day: toDateText(mode.day),
    todayRevealed: mode.todayRevealed,
    weekDays: mode.weekDays,
    today: mode.today.map(entry => ({ rank: entry.rank ?? null, pseudo: entry.pseudo, isMe: entry.isMe, played: entry.played, score: entry.score ?? null })),
    week: mode.week.map(entry => ({ rank: entry.rank ?? null, pseudo: entry.pseudo, isMe: entry.isMe, points: entry.points ?? null, daysPlayed: entry.daysPlayed })),
  };
}

/** Un jour en texte (`2026-11-19`) : le client annonce une `Date` mais le JSON livre un texte. */
function toDateText(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value instanceof Date ? value.toISOString().slice(0, 10) : '';
}

function toIdentity(identity: RankingIdentityResponse): RankingIdentity {
  return { mode: identity.mode === 'alias' ? 'alias' : 'pseudo', name: identity.name, alias: identity.alias ?? null };
}

function toEntry(entry: RankingEntryResponse): RankingEntry {
  return { rank: entry.rank ?? null, pseudo: entry.pseudo, isMe: entry.isMe, points: entry.points ?? null, badge: entry.badge ?? null };
}

function toInvitation(response: InvitationResponse): Invitation {
  return {
    groupName: response.groupName, memberCount: response.memberCount, maxMembers: response.maxMembers,
    isFull: response.isFull, alreadyMember: response.alreadyMember,
  };
}

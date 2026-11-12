import { Group, GroupRanking, Invitation, MyGroups } from '../../domain/group';
import { GroupOutcome, InvitationOutcome, SocialApi } from '../social.api';

export const GROUP: Group = { id: 4, name: 'Potes', inviteCode: 'ABCD2345', memberCount: 3, maxMembers: 15, isOwner: true };
export const OTHER_GROUP: Group = { id: 7, name: 'Famille', inviteCode: 'WXYZ6789', memberCount: 2, maxMembers: 15, isOwner: false };

export const RANKING: GroupRanking = {
  groupId: 4, name: 'Potes',
  entries: [
    { rank: 1, pseudo: 'Théo', isMe: false, points: 1910, badge: 'runs.discs.gold' },
    { rank: 2, pseudo: 'Moi', isMe: true, points: 1380, badge: 'runs.discs.silver' },
    { rank: null, pseudo: 'Sam', isMe: false, points: null, badge: null },
  ],
};

export const INVITATION: Invitation = { groupName: 'Potes', memberCount: 3, maxMembers: 15, isFull: false, alreadyMember: false };

/** Un faux adaptateur de l'API Social : il rend ce qu'on lui a posé et note les appels. */
export class FakeSocialApi {
  groups: MyGroups = { groups: [GROUP, OTHER_GROUP], maxGroups: 5 };
  rankings = new Map<number, GroupRanking>([[4, RANKING], [7, { groupId: 7, name: 'Famille', entries: [{ rank: 1, pseudo: 'Moi', isMe: true, points: 1380, badge: 'runs.discs.silver' }] }]]);
  createOutcome: GroupOutcome = { kind: 'ok', group: GROUP };
  joinOutcome: GroupOutcome = { kind: 'ok', group: GROUP };
  invitationOutcome: InvitationOutcome = { kind: 'ok', invitation: INVITATION };
  failGroups = false;
  failLeave = false;
  readonly calls: string[] = [];

  myGroups(): Promise<MyGroups> {
    this.calls.push('myGroups');
    if (this.failGroups) return Promise.reject(new Error('down'));
    return Promise.resolve(this.groups);
  }

  ranking(groupId: number): Promise<GroupRanking> {
    this.calls.push(`ranking:${groupId}`);
    const ranking = this.rankings.get(groupId);
    if (!ranking) return Promise.reject(new Error('not found'));
    return Promise.resolve(ranking);
  }

  create(name: string): Promise<GroupOutcome> {
    this.calls.push(`create:${name}`);
    return Promise.resolve(this.createOutcome);
  }

  join(code: string): Promise<GroupOutcome> {
    this.calls.push(`join:${code}`);
    return Promise.resolve(this.joinOutcome);
  }

  leave(groupId: number): Promise<void> {
    this.calls.push(`leave:${groupId}`);
    if (this.failLeave) return Promise.reject(new Error('down'));
    this.groups = { ...this.groups, groups: this.groups.groups.filter(group => group.id !== groupId) };
    return Promise.resolve();
  }

  invitation(code: string): Promise<InvitationOutcome> {
    this.calls.push(`invitation:${code}`);
    return Promise.resolve(this.invitationOutcome);
  }
}

export const provideFakeSocialApi = (fake: FakeSocialApi) => ({ provide: SocialApi, useValue: fake });

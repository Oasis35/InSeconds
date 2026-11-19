import { GeneralRanking, Group, GroupRanking, Invitation, MyGroups, RankingIdentity } from '../../domain/group';
import { DailyScores, GroupScores } from '../../domain/group-scores';
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

/** Le Défi du jour de « Potes » vu par un joueur qui a fini le sien : Théo devant, Sam pas encore joué. */
export const DAILY: DailyScores = {
  day: '2026-11-19', todayRevealed: true, weekDays: 7,
  today: [
    { rank: 1, pseudo: 'Théo', isMe: false, played: true, score: 900 },
    { rank: 2, pseudo: 'Moi', isMe: true, played: true, score: 600 },
    { rank: null, pseudo: 'Sam', isMe: false, played: false, score: null },
  ],
  week: [],
};

/** Le même avant que le joueur ait fini son défi : qui a joué, sans aucun score du jour. */
export const DAILY_LOCKED: DailyScores = {
  ...DAILY, todayRevealed: false,
  today: DAILY.today.map(entry => ({ ...entry, rank: null, score: null, played: !entry.isMe && entry.played })),
};

export const INVITATION: Invitation = { groupName: 'Potes', memberCount: 3, maxMembers: 15, isFull: false, alreadyMember: false };

export const GENERAL: GeneralRanking = {
  top: [
    { rank: 1, pseudo: 'Nova', isMe: false, points: 3100, badge: 'runs.discs.platinum' },
    { rank: 2, pseudo: 'Théo', isMe: false, points: 1910, badge: 'runs.discs.gold' },
  ],
  around: [
    { rank: 41, pseudo: 'Iris', isMe: false, points: 1400, badge: 'runs.discs.silver' },
    { rank: 42, pseudo: 'Moi', isMe: true, points: 1380, badge: 'runs.discs.silver' },
  ],
  total: 60, hasAccount: true, identity: { mode: 'pseudo', name: 'Moi', alias: null },
};

/** Un faux adaptateur de l'API Social : il rend ce qu'on lui a posé et note les appels. */
export class FakeSocialApi {
  groups: MyGroups = { groups: [GROUP, OTHER_GROUP], maxGroups: 5 };
  rankings = new Map<number, GroupRanking>([[4, RANKING], [7, { groupId: 7, name: 'Famille', entries: [{ rank: 1, pseudo: 'Moi', isMe: true, points: 1380, badge: 'runs.discs.silver' }] }]]);
  createOutcome: GroupOutcome = { kind: 'ok', group: GROUP };
  joinOutcome: GroupOutcome = { kind: 'ok', group: GROUP };
  scoresByGroup = new Map<number, GroupScores>([[4, { groupId: 4, name: 'Potes', daily: DAILY }], [7, { groupId: 7, name: 'Famille', daily: DAILY }]]);
  invitationOutcome: InvitationOutcome = { kind: 'ok', invitation: INVITATION };
  general: GeneralRanking = GENERAL;
  failGeneral = false;
  failIdentity = false;
  private aliasCount = 0;
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

  scores(groupId: number): Promise<GroupScores> {
    this.calls.push(`scores:${groupId}`);
    const scores = this.scoresByGroup.get(groupId);
    if (!scores) return Promise.reject(new Error('not found'));
    return Promise.resolve(scores);
  }

  generalRanking(): Promise<GeneralRanking> {
    this.calls.push('generalRanking');
    if (this.failGeneral) return Promise.reject(new Error('down'));
    return Promise.resolve(this.general);
  }

  setRankingIdentity(mode: 'pseudo' | 'alias'): Promise<RankingIdentity> {
    this.calls.push(`identity:${mode}`);
    if (this.failIdentity) return Promise.reject(new Error('down'));
    let identity: RankingIdentity = { mode: 'pseudo', name: 'Moi', alias: null };
    if (mode === 'alias') identity = this.general.identity?.mode === 'alias' ? this.general.identity : this.alias();
    this.general = { ...this.general, identity };
    return Promise.resolve(identity);
  }

  drawRankingAlias(): Promise<RankingIdentity> {
    this.calls.push('alias');
    if (this.failIdentity) return Promise.reject(new Error('down'));
    const identity = this.alias();
    this.general = { ...this.general, identity };
    return Promise.resolve(identity);
  }

  private alias(): RankingIdentity {
    this.aliasCount++;
    const alias = `Hibou rêveur ${10 + this.aliasCount}`;
    return { mode: 'alias', name: alias, alias };
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

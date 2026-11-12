import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SocialClient } from '../../api/social/api.generated';
import { SocialApi } from './social.api';

/** Une erreur comme le client généré la lève pour une réponse `ProblemDetails` : le statut et le code de l'API. */
const problem = (status: number, code: string) => ({ status, code, traceId: 't' });

const summary = { id: 4, name: 'Potes', inviteCode: 'ABCD2345', memberCount: 1, maxMembers: 15, isOwner: true };

describe('SocialApi', () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let api: SocialApi;

  beforeEach(() => {
    client = { listMyGroups: vi.fn(), getGroupRanking: vi.fn(), createGroup: vi.fn(), joinGroup: vi.fn(), leaveGroup: vi.fn(), getInvitation: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: SocialClient, useValue: client }, SocialApi] });
    api = TestBed.inject(SocialApi);
  });

  it('lit mes groupes', async () => {
    client['listMyGroups'].mockReturnValue(of({ groups: [summary], maxGroups: 5 }));

    expect(await api.myGroups()).toEqual({ groups: [summary], maxGroups: 5 });
  });

  it('lit un classement, vides en null', async () => {
    client['getGroupRanking'].mockReturnValue(of({
      groupId: 4, name: 'Potes',
      entries: [
        { rank: 1, pseudo: 'Théo', isMe: false, performance: 0.56, gamesPlayed: 4, bestScore: 2100, points: 1910, badge: 'runs.discs.gold' },
        { rank: undefined, pseudo: 'Sam', isMe: true, performance: undefined, gamesPlayed: 0, bestScore: undefined, points: undefined, badge: undefined },
      ],
    }));

    expect(await api.ranking(4)).toEqual({
      groupId: 4, name: 'Potes',
      entries: [
        { rank: 1, pseudo: 'Théo', isMe: false, points: 1910, badge: 'runs.discs.gold' },
        { rank: null, pseudo: 'Sam', isMe: true, points: null, badge: null },
      ],
    });
  });

  it('crée un groupe, le nom rogné', async () => {
    client['createGroup'].mockReturnValue(of(summary));

    expect(await api.create('  Potes ')).toEqual({ kind: 'ok', group: summary });
    expect(client['createGroup']).toHaveBeenCalledWith({ name: 'Potes' });
  });

  it.each([
    ['social.invalid_name', 'invalid_name'], ['social.too_many_groups', 'too_many_groups'], ['social.account_required', 'account_required'],
  ])('un refus de création connu (%s) est une issue', async (code, kind) => {
    client['createGroup'].mockReturnValue(throwError(() => problem(400, code)));

    expect(await api.create('Potes')).toEqual({ kind });
  });

  it('une panne à la création est une erreur', async () => {
    client['createGroup'].mockReturnValue(throwError(() => problem(500, 'common.unexpected')));

    expect(await api.create('Potes')).toEqual({ kind: 'error' });
  });

  it('rejoint un groupe, ou dit pourquoi non', async () => {
    client['joinGroup'].mockReturnValue(of(summary));
    expect(await api.join('ABCD2345')).toEqual({ kind: 'ok', group: summary });

    client['joinGroup'].mockReturnValue(throwError(() => problem(409, 'social.group_full')));
    expect(await api.join('ABCD2345')).toEqual({ kind: 'group_full' });
  });

  it('lit une invitation, inconnue ou en panne', async () => {
    const invitation = { groupName: 'Potes', memberCount: 3, maxMembers: 15, isFull: false, alreadyMember: false };
    client['getInvitation'].mockReturnValue(of(invitation));
    expect(await api.invitation('ABCD2345')).toEqual({ kind: 'ok', invitation });

    client['getInvitation'].mockReturnValue(throwError(() => problem(404, 'social.invitation_not_found')));
    expect(await api.invitation('ABCD2345')).toEqual({ kind: 'invitation_not_found' });

    client['getInvitation'].mockReturnValue(throwError(() => problem(500, 'common.unexpected')));
    expect(await api.invitation('ABCD2345')).toEqual({ kind: 'error' });
  });

  it('quitte un groupe', async () => {
    client['leaveGroup'].mockReturnValue(of(undefined));

    await api.leave(4);

    expect(client['leaveGroup']).toHaveBeenCalledWith(4);
  });
});

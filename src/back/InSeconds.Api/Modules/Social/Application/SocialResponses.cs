using InSeconds.Api.Modules.Social.Domain;

namespace InSeconds.Api.Modules.Social.Application;

/// <param name="InviteCode">Le code du lien d'invitation : seuls les membres le voient.</param>
public sealed record GroupSummaryResponse(int Id, string Name, int MemberCount, int MaxMembers, bool IsOwner, string InviteCode);

public sealed record GroupListResponse(IReadOnlyList<GroupSummaryResponse> Groups, int MaxGroups);

/// <summary>Un membre vu par un autre membre : son pseudo, jamais son identifiant ni son adresse.</summary>
public sealed record GroupMemberResponse(string Pseudo, bool IsMe, bool IsOwner, DateTimeOffset JoinedAt);

public sealed record GroupDetailResponse(
    int Id, string Name, string InviteCode, bool IsOwner, int MaxMembers, DateTimeOffset CreatedAt, IReadOnlyList<GroupMemberResponse> Members);

/// <param name="Rank">Vide pour un membre qui n'a fini aucune partie.</param>
/// <param name="Performance">De 0 à 1, la moyenne des modes joués ; vide sans partie.</param>
/// <param name="BestScore">Son meilleur score, vide si aucun mode joué n'en donne.</param>
/// <param name="Points">Ses points de niveau ; vide sans partie, ou si aucun mode joué n'en donne.</param>
/// <param name="Badge">La clé de traduction de son disque (<c>runs.discs.gold</c>) ; vide sans partie.</param>
public sealed record RankingEntryResponse(int? Rank, string Pseudo, bool IsMe, double? Performance, int GamesPlayed, int? BestScore, int? Points, string? Badge);

public sealed record GroupRankingResponse(int GroupId, string Name, IReadOnlyList<RankingEntryResponse> Entries);

/// <summary>Le classement général : sa tête, puis le joueur et ses voisins s'il y apparaît plus bas.</summary>
/// <param name="Total">Combien de joueurs sont classés.</param>
/// <param name="Visible">Le joueur a choisi d'y apparaître.</param>
/// <param name="CanAppear">Le joueur a un compte : il peut choisir d'y apparaître.</param>
/// <param name="TopPercent">Sa position par dizaines (« top 30 % »), qu'il apparaisse ou non ; vide tant qu'il n'a fini aucune partie.</param>
public sealed record GeneralRankingResponse(
    IReadOnlyList<RankingEntryResponse> Top, IReadOnlyList<RankingEntryResponse> Around, int Total, bool Visible, bool CanAppear, int? TopPercent);

/// <summary>Ce que montre un lien d'invitation avant de rejoindre : le nom du groupe et sa place, jamais ses membres.</summary>
public sealed record InvitationResponse(string GroupName, int MemberCount, int MaxMembers, bool IsFull, bool AlreadyMember);

public sealed record InviteCodeResponse(string InviteCode);

internal static class SocialViews
{
    public static GroupSummaryResponse SummaryOf(GroupView group, Guid playerId, int maxMembers) =>
        new(group.Id, group.Name, group.Members.Count, maxMembers, group.OwnerId == playerId, group.InviteCode);

    public static GroupSummaryResponse SummaryOf(Group group, Guid playerId, int maxMembers) =>
        new(group.Id, group.Name, group.Members.Count, maxMembers, group.IsOwner(playerId), group.InviteCode);
}

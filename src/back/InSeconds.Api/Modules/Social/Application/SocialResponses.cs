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

/// <summary>Un membre au classement du jour d'un mode.</summary>
/// <param name="Rank">Vide s'il n'a pas fini sa partie du jour, ou tant que le joueur qui regarde n'a pas fini la sienne.</param>
/// <param name="Played">Il a fini sa partie du jour (montré même avant que le joueur qui regarde ait fini la sienne).</param>
/// <param name="Score">Son score du jour, vide dans les mêmes cas que le rang.</param>
public sealed record TodayScoreEntryResponse(int? Rank, string Pseudo, bool IsMe, bool Played, int? Score);

/// <summary>Un membre au classement de la semaine d'un mode.</summary>
/// <param name="Rank">Vide s'il n'a fini aucune partie sur la semaine.</param>
/// <param name="Points">La somme de ses scores sur la semaine (un jour manqué vaut 0), vide sans partie.</param>
/// <param name="PlayedDays">
/// Les jours de la semaine (dates des défis) où il a fini une partie, de 0 à 7, du plus ancien au plus récent : les sept points de la semaine à
/// l'écran.
/// </param>
public sealed record WeekScoreEntryResponse(int? Rank, string Pseudo, bool IsMe, int? Points, IReadOnlyList<DateOnly> PlayedDays);

/// <summary>Le classement d'un mode : le jour et la semaine.</summary>
/// <param name="Mode">Le nom du mode (<c>daily</c>).</param>
/// <param name="Day">Le jour de jeu en cours (jour UTC).</param>
/// <param name="TodayRevealed">
/// Le joueur a fini sa partie du jour : les scores du jour sont montrés. Tant que non, aucun score du jour, ni dans la semaine ; la veille en sort
/// aussi tant que sa partie de la veille est en cours.
/// </param>
/// <param name="WeekDays">La longueur de la semaine glissante, en jours (7).</param>
public sealed record ModeScoresResponse(
    string Mode, DateOnly Day, bool TodayRevealed, int WeekDays, IReadOnlyList<TodayScoreEntryResponse> Today, IReadOnlyList<WeekScoreEntryResponse> Week);

public sealed record GroupScoresResponse(int GroupId, string Name, IReadOnlyList<ModeScoresResponse> Modes);

/// <summary>Le classement général : sa tête, puis le joueur et ses voisins s'il y est classé plus bas.</summary>
/// <param name="Total">Combien de joueurs sont classés.</param>
/// <param name="HasAccount">Le joueur a un compte (un invité n'y figure jamais).</param>
/// <param name="Identity">Le nom sous lequel il y apparaît (pseudo ou alias) ; vide pour un invité.</param>
public sealed record GeneralRankingResponse(
    IReadOnlyList<RankingEntryResponse> Top, IReadOnlyList<RankingEntryResponse> Around, int Total, bool HasAccount, RankingIdentityResponse? Identity);

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

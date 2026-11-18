namespace InSeconds.Api.Modules.Social.Application;

/// <summary>
/// La section « social » de la copie des données d'un joueur (RGPD) : les groupes où il est. Une section vide (aucun groupe) reste une section. Jamais
/// les pseudos des autres membres (données d'autres personnes) ni le code d'invitation.
/// </summary>
/// <param name="RankingIdentity">Le nom sous lequel il apparaît au classement général.</param>
public sealed record SocialDataExport(IReadOnlyList<SocialGroupExport> Groups, SocialRankingIdentityExport RankingIdentity);

/// <summary>Le nom du joueur au classement général : <c>pseudo</c> (son pseudo de compte, le défaut) ou <c>alias</c>, avec l'alias et la date du tirage.</summary>
public sealed record SocialRankingIdentityExport(string Mode, string? Alias, DateTimeOffset? ChosenAt);

/// <param name="IsOwner">Il en est le créateur (et peut le supprimer).</param>
/// <param name="JoinedAt">Quand il l'a rejoint.</param>
/// <param name="MemberCount">Combien de membres le groupe a aujourd'hui, lui compris.</param>
public sealed record SocialGroupExport(string Name, bool IsOwner, DateTimeOffset JoinedAt, DateTimeOffset CreatedAt, int MemberCount);

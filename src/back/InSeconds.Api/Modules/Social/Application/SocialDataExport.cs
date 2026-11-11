namespace InSeconds.Api.Modules.Social.Application;

/// <summary>
/// La section « social » de la copie des données d'un joueur (RGPD) : les groupes où il est. Une section vide (aucun groupe) reste une section. Jamais
/// les pseudos des autres membres (données d'autres personnes) ni le code d'invitation.
/// </summary>
public sealed record SocialDataExport(IReadOnlyList<SocialGroupExport> Groups);

/// <param name="IsOwner">Il en est le créateur (et peut le supprimer).</param>
/// <param name="JoinedAt">Quand il l'a rejoint.</param>
/// <param name="MemberCount">Combien de membres le groupe a aujourd'hui, lui compris.</param>
public sealed record SocialGroupExport(string Name, bool IsOwner, DateTimeOffset JoinedAt, DateTimeOffset CreatedAt, int MemberCount);

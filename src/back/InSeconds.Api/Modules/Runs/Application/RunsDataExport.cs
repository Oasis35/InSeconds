namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// La section « runs » de la copie des données d'un joueur (RGPD) : ses parties (réponses), les défis qu'il a
/// créés, son record, son accès, son niveau et les défis d'amis reçus. Une section vide (rien joué) reste une section.
/// </summary>
/// <param name="Access">Quand l'admin l'a autorisé, rien s'il n'a pas de ligne d'accès (un admin l'a d'office).</param>
public sealed record RunsDataExport(
    IReadOnlyList<RunGameExport> Games, IReadOnlyList<RunChallengeExport> CreatedChallenges, RunRecordExport? Record, DateTimeOffset? Access,
    RunLevelExport? Level = null, IReadOnlyList<RunReceivedChallengeExport>? ReceivedChallenges = null);

/// <summary>Un défi d'ami reçu : le lien de la playlist, quand il a été reçu et, s'il a été refusé, quand.</summary>
public sealed record RunReceivedChallengeExport(string ChallengeCode, DateTimeOffset ReceivedAt, DateTimeOffset? DismissedAt);

/// <summary>Le niveau : ses points à sa dernière série finie (avant toute inactivité), les séries comptées, la fin de la dernière et l'écart de points qu'elle a donné.</summary>
public sealed record RunLevelExport(int Points, int RunsPlayed, DateTimeOffset UpdatedAt, int LastDelta = 0);

/// <param name="ChallengeCode">Le lien du défi joué.</param>
/// <param name="Status"><c>Pending</c>, <c>Completed</c>, <c>Lost</c> ou <c>Abandoned</c>.</param>
public sealed record RunGameExport(
    string ChallengeCode, string Status, DateTimeOffset StartedAt, DateTimeOffset? EndedAt, int RoundsPassed, int TotalScore,
    IReadOnlyList<RunAnswerExport> Answers);

/// <summary>Jamais le texte saisi : seulement les verdicts et les points.</summary>
public sealed record RunAnswerExport(int Position, bool ArtistFound, bool TitleFound, int Points, bool Neutralized, DateTimeOffset AnsweredAt);

public sealed record RunChallengeExport(string Code, DateTimeOffset CreatedAt);

public sealed record RunRecordExport(int BestScore, int BestRoundsPassed, DateTimeOffset AchievedAt);

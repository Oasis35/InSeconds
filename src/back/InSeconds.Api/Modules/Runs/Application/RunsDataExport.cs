namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// La section « runs » de la copie des données d'un joueur (RGPD) : ses parties (réponses, difficulté de chaque manche, cartes), les défis qu'il a
/// créés, son record et son accès. Une section vide (rien joué) reste une section.
/// </summary>
/// <param name="Access">Quand l'admin l'a autorisé, rien s'il n'a pas de ligne d'accès (un admin l'a d'office).</param>
public sealed record RunsDataExport(
    IReadOnlyList<RunGameExport> Games, IReadOnlyList<RunChallengeExport> CreatedChallenges, RunRecordExport? Record, DateTimeOffset? Access,
    RunLevelExport? Level = null);

/// <summary>Le niveau : ses points, les parties finies comptées et les scores de ses dernières parties (la fenêtre de la moyenne).</summary>
public sealed record RunLevelExport(int Points, int RunsPlayed, IReadOnlyList<int> RecentScores, DateTimeOffset UpdatedAt);

/// <param name="ChallengeCode">Le lien du défi joué.</param>
/// <param name="Status"><c>Pending</c>, <c>Won</c>, <c>Lost</c> ou <c>Abandoned</c>.</param>
public sealed record RunGameExport(
    string ChallengeCode, string Status, DateTimeOffset StartedAt, DateTimeOffset? EndedAt, int RoundsPassed, int TotalScore,
    IReadOnlyList<RunAnswerExport> Answers, IReadOnlyList<RunRoundExport> Rounds, IReadOnlyList<RunCardExport> Cards);

/// <summary>
/// Un coup de pouce reçu : la carte, le palier où il a été pris (0 : au départ), puis lâché ou joué (sur quel morceau, dans quelle manche, à quel
/// rang parmi les cartes jouées) ; pour un Échange, le morceau joué à la place (identifiant Deezer). Une carte durable lâchée garde la dernière manche
/// où elle agissait.
/// </summary>
public sealed record RunCardExport(
    string Card, int AcquiredRound, DateTimeOffset AcquiredAt, DateTimeOffset? DroppedAt, DateTimeOffset? PlayedAt, int? PlayedPosition,
    int? PlayedRound, int? PlayOrder, long? ReplacementDeezerTrackId, int? DroppedAfterRound = null);

/// <summary>La difficulté d'une manche à choix : <c>easy</c>, <c>safe</c> ou <c>risky</c>, et quand elle a été choisie.</summary>
public sealed record RunRoundExport(int Round, string Difficulty, DateTimeOffset ChosenAt);

/// <summary>Jamais le texte saisi : seulement les verdicts et les points.</summary>
public sealed record RunAnswerExport(int Position, bool ArtistFound, bool TitleFound, int Points, bool Neutralized, DateTimeOffset AnsweredAt);

public sealed record RunChallengeExport(string Code, DateTimeOffset CreatedAt);

public sealed record RunRecordExport(int BestScore, int BestRoundsPassed, DateTimeOffset AchievedAt);

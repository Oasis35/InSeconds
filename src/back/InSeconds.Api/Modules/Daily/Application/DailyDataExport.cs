namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// La section « daily » de la copie des données d'un joueur (RGPD) : sa série et toutes ses parties, la plus ancienne d'abord.
/// </summary>
/// <param name="Streak">Rien s'il n'a jamais terminé de partie ni reçu de gel.</param>
public sealed record DailyDataExport(StreakExport? Streak, IReadOnlyList<GameExport> Games);

/// <param name="LastPlayedDate">Date du dernier défi terminé (jour UTC).</param>
public sealed record StreakExport(int CurrentStreak, DateOnly? LastPlayedDate, int Freezes);

/// <param name="Date">Le jour du défi.</param>
/// <param name="Status"><c>Pending</c>, <c>Completed</c>, <c>Abandoned</c> ou <c>Expired</c>.</param>
public sealed record GameExport(
    DateOnly Date, string Status, DateTimeOffset StartedAt, DateTimeOffset? EndedAt, int TotalScore, IReadOnlyList<GameTrackExport> Tracks);

/// <param name="Artist">L'artiste attendu, rien si le morceau a été supprimé du catalogue depuis.</param>
/// <param name="Title">Le titre attendu, tel que montré au joueur.</param>
/// <param name="HintLevel">0 sans indice, 1 année, 2 artiste masqué.</param>
public sealed record GameTrackExport(
    int Position, string? Artist, string? Title, decimal ListenedSeconds, int HintLevel, bool ArtistFound, bool TitleFound, int Score, DateTimeOffset? AnsweredAt);

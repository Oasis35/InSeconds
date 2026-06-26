namespace InSeconds.Api.Features.Stats.Today;

public sealed record TodayStatsResponse(
    int? YourScore,
    int MedianScore,
    int TotalPlayers,
    int CurrentStreak,
    IReadOnlyList<TrackStat> Tracks);

public sealed record TrackStat(
    int Position,
    string Artist,
    string Title,
    long DeezerTrackId,
    string? CoverUrl,
    double FailureRatePercent,
    double? AverageSecondsWhenCorrect,
    bool? ArtistCorrect,
    bool? TitleCorrect,
    decimal? ListenedDurationSeconds);

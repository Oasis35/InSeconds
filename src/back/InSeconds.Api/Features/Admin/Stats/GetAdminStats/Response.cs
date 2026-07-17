namespace InSeconds.Api.Features.Admin.Stats.GetAdminStats;

public sealed record AdminStatsResponse(
    IReadOnlyList<ChallengeStatsDto> Challenges,
    IReadOnlyList<DailyActivityDto> DailyActivity,
    PlayerBreakdownDto PlayerBreakdown,
    IReadOnlyList<DateOnly> AvailableDates,
    DailyKpisDto? SelectedDayKpis);

public sealed record ChallengeStatsDto(
    int Id,
    DateOnly Date,
    int PlayerCount,
    int PendingCount,
    int AbandonedCount,
    int? ScoreMin,
    int? ScoreMax,
    double? ScoreAvg,
    double? ScoreMedian,
    IReadOnlyList<TrackStatsDto> Tracks);

public sealed record TrackStatsDto(
    int Position,
    string Artist,
    string Title,
    int TotalAnswers,
    double ArtistCorrectRate,
    double TitleCorrectRate,
    double ExtendedRate,
    double? AvgListenedSeconds);

public sealed record DailyActivityDto(DateOnly Date, int PlayerCount);

public sealed record PlayerBreakdownDto(int TotalGuests, int TotalRegistered, int ActiveLast7Days, int ActiveLast30Days);

// KPIs pour un jour sélectionné
public sealed record DailyKpisDto(
    DateOnly Date,
    int CompletedCount,
    int AbandonedCount,   // Abandoned + Pending si jour passé, Abandoned seul si aujourd'hui
    int TotalSessions,    // Completed + Abandoned + Pending
    double CompletionRate, // CompletedCount / TotalSessions * 100
    double? MedianScore);

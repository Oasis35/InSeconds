using InSeconds.Api.Common.Stats;

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
    int PendingCount,     // en cours — pour un défi passé, replié sur ExpiredCount (0 ici)
    int AbandonedCount,   // clic explicite sur « Abandonner »
    int ExpiredCount,     // Pending jamais terminés (sortie sans abandon) + Pending d'un jour passé
    int? ScoreMin,
    int? ScoreMax,
    double? ScoreAvg,
    double? ScoreMedian,
    IReadOnlyList<TrackStatsDto> Tracks,
    IReadOnlyList<ChallengePlayerDto> Players);

// Status en string (pas l'enum SessionStatus directement) : évite toute ambiguïté de
// sérialisation JSON (int vs string) côté client généré par NSwag.
public sealed record ChallengePlayerDto(Guid PlayerId, string Status, int Score, string? Pseudo);

public sealed record TrackStatsDto(
    int Position,
    string Artist,
    string Title,
    int TotalAnswers,
    double ArtistCorrectRate,
    double TitleCorrectRate,
    double ExtendedRate,
    double? AvgListenedSeconds,
    IReadOnlyList<DurationBucketDto> GuessTimeDistribution,
    int NotFoundCount);

public sealed record DailyActivityDto(DateOnly Date, int PlayerCount);

public sealed record PlayerBreakdownDto(int TotalGuests, int TotalRegistered, int ActiveLast7Days, int ActiveLast30Days);

// KPIs pour un jour sélectionné
public sealed record DailyKpisDto(
    DateOnly Date,
    int CompletedCount,
    int AbandonedCount,   // clic explicite sur « Abandonner » uniquement
    int ExpiredCount,     // Pending non terminés (sortie sans abandon) + (jour passé) Pending pas encore expirés
    int PendingCount,     // en cours — 0 pour un jour passé (replié sur ExpiredCount)
    int TotalSessions,    // Completed + Abandoned + Expired + Pending
    double CompletionRate, // CompletedCount / TotalSessions * 100
    double? MedianScore);

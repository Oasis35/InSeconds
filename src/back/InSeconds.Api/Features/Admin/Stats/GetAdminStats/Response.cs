namespace InSeconds.Api.Features.Admin.Stats.GetAdminStats;

// Payload du Dashboard admin. Les stats par défi (lourdes) vivent dans un endpoint séparé,
// GET /api/admin/challenge-stats (Features/Admin/Stats/GetChallengeStats), chargé seulement
// à l'ouverture de l'onglet Défis.
public sealed record AdminStatsResponse(
    IReadOnlyList<DailyActivityDto> DailyActivity,
    PlayerBreakdownDto PlayerBreakdown,
    IReadOnlyList<DateOnly> AvailableDates,
    DailyKpisDto? SelectedDayKpis);

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

namespace InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap;

public static class WeeklyRecapStatus
{
    public const string Ok = "ok";
    // Aucun morceau n'a atteint MinAnswers réponses sur la période : pas de story à produire.
    public const string InsufficientData = "insufficient_data";
}

public sealed record WeeklyRecapResponse(
    string Status,
    DateOnly From,
    DateOnly To,
    int MinAnswers,
    WeeklyTrackDto? MostFound,
    // null si un seul morceau est éligible (évite d'afficher le même morceau deux fois).
    WeeklyTrackDto? MostMissed);

// SuccessRatePercent = % de réponses avec artiste ET titre justes.
public sealed record WeeklyTrackDto(
    string Artist,
    string Title,
    string? CoverUrl,
    double SuccessRatePercent,
    int Answers);


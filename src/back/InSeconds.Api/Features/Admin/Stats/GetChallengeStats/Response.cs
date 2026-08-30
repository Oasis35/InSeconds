using InSeconds.Api.Common.Stats;

namespace InSeconds.Api.Features.Admin.Stats.GetChallengeStats;

public sealed record ChallengeStatsResponse(IReadOnlyList<ChallengeStatsDto> Challenges);

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
public sealed record ChallengePlayerDto(Guid PlayerId, string Status, int Score);

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

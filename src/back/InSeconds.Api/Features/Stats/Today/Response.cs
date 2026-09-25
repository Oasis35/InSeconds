using InSeconds.Api.Common.Stats;

namespace InSeconds.Api.Features.Stats.Today;

public sealed record TodayStatsResponse(
    int? YourScore,
    int MedianScore,
    int TotalPlayers,
    int CurrentStreak,
    IReadOnlyList<TrackStat> Tracks,
    // Gels consommés par la partie du jour (toast « 1 gel a sauvé ta série »).
    int FreezesUsed,
    // Connecté : gel gagné par la partie du jour (« +1 gel gagné ! ») ; invité : palier de
    // gel atteint (« Tu aurais gagné un gel ! »).
    bool FreezeMilestone,
    // Égaliseur des scores du jour (sessions complétées) : plus bas / plus haut (null sans
    // joueur), borne haute de l'axe, tranches, et % des autres joueurs battus (null si le
    // joueur n'a pas de score ou joue seul).
    int? MinScore,
    int? MaxScore,
    int MaxPossibleScore,
    IReadOnlyList<ScoreBucketDto> ScoreDistribution,
    int? BetterThanPercent);

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
    decimal? ListenedDurationSeconds,
    int? Score,
    IReadOnlyList<DurationBucketDto> GuessTimeDistribution,
    int NotFoundCount);

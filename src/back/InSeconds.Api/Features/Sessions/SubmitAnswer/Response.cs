namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed record SubmitAnswerResponse(
    bool ArtistCorrect,
    bool TitleCorrect,
    int Score,
    string CorrectArtist,
    string CorrectTitle,
    decimal ListenedDurationSeconds,
    double? AverageSecondsWhenCorrect,
    double FailureRatePercent,
    IReadOnlyList<DurationBucketDto> GuessTimeDistribution,
    int NotFoundCount);

/// <summary>Nombre de joueurs ayant trouvé (artiste ou titre) pour un palier d'écoute donné.</summary>
public sealed record DurationBucketDto(decimal DurationSeconds, int Count);

using InSeconds.Api.Common.Stats;

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed record SubmitAnswerResponse(
    bool ArtistCorrect,
    bool TitleCorrect,
    int Score,
    string CorrectArtist,
    string CorrectTitle,
    // Révélé seulement après la réponse (lien « À écouter sur Deezer ») : jamais dans
    // StartSession, sinon deezer.com/track/{id} donnerait la réponse avant de jouer.
    long DeezerTrackId,
    decimal ListenedDurationSeconds,
    double? AverageSecondsWhenCorrect,
    double FailureRatePercent,
    IReadOnlyList<DurationBucketDto> GuessTimeDistribution,
    int NotFoundCount,
    int HintLevelUsed,
    int HintPenaltyPercentApplied);

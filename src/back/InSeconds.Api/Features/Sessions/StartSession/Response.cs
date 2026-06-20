namespace InSeconds.Api.Features.Sessions.StartSession;

public sealed record StartSessionResponse(
    int SessionId,
    IReadOnlyList<TrackSlot> Tracks,
    int CurrentStreak,
    bool IsResuming,
    int ResumeFromPosition,
    IReadOnlyList<ResumedAnswer> CompletedAnswers);

public sealed record TrackSlot(
    int Id,
    int Position,
    string PreviewUrl,
    string? CoverUrl,
    long DeezerTrackId);

public sealed record ResumedAnswer(
    int Position,
    bool ArtistCorrect,
    bool TitleCorrect,
    int Score,
    decimal ListenedDurationSeconds);

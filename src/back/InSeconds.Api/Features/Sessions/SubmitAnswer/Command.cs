namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed record SubmitAnswerCommand(
    Guid PlayerId,
    int SessionId,
    int DailyChallengeTrackId,
    int ListenedDurationSeconds,
    bool WasExtended,
    string? ArtistAnswer,
    string? TitleAnswer);

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed record SubmitAnswerCommand(
    Guid PlayerId,
    int SessionId,
    int DailyChallengeTrackId,
    decimal ListenedDurationSeconds,
    bool WasExtended,
    string? ArtistAnswer,
    string? TitleAnswer);

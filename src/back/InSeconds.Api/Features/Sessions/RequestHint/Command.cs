namespace InSeconds.Api.Features.Sessions.RequestHint;

public sealed record RequestHintCommand(Guid PlayerId, int SessionId, int DailyChallengeTrackId, int Level);

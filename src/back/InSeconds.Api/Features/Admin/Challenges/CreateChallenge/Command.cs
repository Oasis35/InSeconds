namespace InSeconds.Api.Features.Admin.Challenges.CreateChallenge;

public sealed record CreateChallengeCommand(DateOnly Date, IReadOnlyList<long> DeezerTrackIds);

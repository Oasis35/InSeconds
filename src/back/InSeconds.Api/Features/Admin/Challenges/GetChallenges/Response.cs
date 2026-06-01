namespace InSeconds.Api.Features.Admin.Challenges.GetChallenges;

public sealed record ChallengeDto(int Id, DateOnly Date, IReadOnlyList<TrackDto> Tracks);
public sealed record TrackDto(int Position, string Artist, string Title, long DeezerTrackId);

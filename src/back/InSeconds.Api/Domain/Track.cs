namespace InSeconds.Api.Domain;

public sealed class Track
{
    public int Id { get; set; }
    public long DeezerTrackId { get; set; }
    public required string Artist { get; set; }
    public required string Title { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public ICollection<DailyChallengeTrack> DailyChallengeTracks { get; set; } = [];
}

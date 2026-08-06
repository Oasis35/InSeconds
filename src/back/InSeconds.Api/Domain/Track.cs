namespace InSeconds.Api.Domain;

public sealed class Track
{
    public int Id { get; set; }
    public long DeezerTrackId { get; set; }
    public required string Artist { get; set; }
    public required string Title { get; set; }
    public string? CoverHash { get; set; }
    public bool HasPreview { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateOnly? LastUsedDate { get; set; }
    public int UsageCount { get; set; }

    public ICollection<DailyChallengeTrack> DailyChallengeTracks { get; set; } = [];
}

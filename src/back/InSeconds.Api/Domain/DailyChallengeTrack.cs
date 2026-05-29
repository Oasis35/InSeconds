namespace InSeconds.Api.Domain;

public sealed class DailyChallengeTrack
{
    public int Id { get; set; }
    public int DailyChallengeId { get; set; }
    public int TrackId { get; set; }
    public int DeezerRankSnapshot { get; set; }
    public int Position { get; set; }

    public DailyChallenge DailyChallenge { get; set; } = null!;
    public Track Track { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
}

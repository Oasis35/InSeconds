namespace InSeconds.Api.Domain;

public sealed class GameSession
{
    public int Id { get; set; }
    public Guid PlayerId { get; set; }
    public int DailyChallengeId { get; set; }
    public int TotalScore { get; set; }
    public int TotalDurationSeconds { get; set; }
    public DateTime CreatedAt { get; set; }

    public Player Player { get; set; } = null!;
    public DailyChallenge DailyChallenge { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
}

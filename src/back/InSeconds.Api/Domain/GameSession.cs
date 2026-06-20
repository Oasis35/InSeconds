namespace InSeconds.Api.Domain;

public sealed class GameSession
{
    public int Id { get; set; }
    public Guid PlayerId { get; set; }
    public int DailyChallengeId { get; set; }
    public int TotalScore { get; set; }
    public decimal TotalDurationSeconds { get; set; }
    public DateTime CreatedAt { get; set; }
    public SessionStatus Status { get; set; } = SessionStatus.Pending;
    public DateTime? CompletedAt { get; set; }
    public DateTime? AbandonedAt { get; set; }

    public Player Player { get; set; } = null!;
    public DailyChallenge DailyChallenge { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
}

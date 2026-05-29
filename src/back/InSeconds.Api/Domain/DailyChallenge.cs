namespace InSeconds.Api.Domain;

public sealed class DailyChallenge
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }
    public int Seed { get; set; }

    public ICollection<DailyChallengeTrack> Tracks { get; set; } = [];
    public ICollection<GameSession> GameSessions { get; set; } = [];
}

namespace InSeconds.Api.Domain;

public sealed class GameSessionAnswer
{
    public int Id { get; set; }
    public int GameSessionId { get; set; }
    public int DailyChallengeTrackId { get; set; }
    public decimal ListenedDurationSeconds { get; set; }
    public bool WasExtended { get; set; }
    public string? ArtistAnswer { get; set; }
    public string? TitleAnswer { get; set; }
    public bool ArtistCorrect { get; set; }
    public bool TitleCorrect { get; set; }
    public int Score { get; set; }

    public GameSession GameSession { get; set; } = null!;
    public DailyChallengeTrack Track { get; set; } = null!;
}

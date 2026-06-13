namespace InSeconds.Api.Domain;

public sealed class Player
{
    public Guid Id { get; set; }
    public bool IsGuest { get; set; }
    public string? Pseudo { get; set; }
    public string? Email { get; set; }
    public Guid AuthToken { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public int CurrentStreak { get; set; }
    public DateOnly? LastPlayedDate { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public ICollection<GameSession> GameSessions { get; set; } = [];
}

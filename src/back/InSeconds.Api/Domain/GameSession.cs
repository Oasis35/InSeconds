namespace InSeconds.Api.Domain;

public sealed class GameSession
{
    public int Id { get; private set; }
    public Guid PlayerId { get; private set; }
    public int DailyChallengeId { get; private set; }
    public int TotalScore { get; private set; }
    public decimal TotalDurationSeconds { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public SessionStatus Status { get; private set; } = SessionStatus.Pending;
    public DateTime? CompletedAt { get; private set; }
    public DateTime? AbandonedAt { get; private set; }

    // Anti-cheat : durée min déjà écoutée sur le morceau en cours (reset à chaque nouvelle track)
    public int? CurrentTrackId { get; private set; }
    public decimal? CurrentTrackMinListenedSeconds { get; private set; }

    public Player Player { get; set; } = null!;
    public DailyChallenge DailyChallenge { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];

    private GameSession() { } // EF Core

    public static GameSession StartNew(Guid playerId, int dailyChallengeId, DateTime now) => new()
    {
        PlayerId = playerId,
        DailyChallengeId = dailyChallengeId,
        TotalScore = 0,
        TotalDurationSeconds = 0,
        CreatedAt = now,
        Status = SessionStatus.Pending,
    };

    public void AddAnswerScore(int score, decimal durationSeconds)
    {
        TotalScore += score;
        TotalDurationSeconds += durationSeconds;
    }

    public void Complete(DateTime now)
    {
        Status = SessionStatus.Completed;
        CompletedAt = now;
    }

    public void Abandon(DateTime now)
    {
        Status = SessionStatus.Abandoned;
        AbandonedAt = now;
    }

    // Expiry paresseuse — PAS Abandoned (distinction utilisée par les stats admin).
    public void Expire(DateTime now)
    {
        Status = SessionStatus.Expired;
        AbandonedAt = now;
    }

    public void ReleaseTrackLock()
    {
        CurrentTrackId = null;
        CurrentTrackMinListenedSeconds = null;
    }

    // Anti-cheat : jamais réduire le minimum déjà écouté sur la track en cours.
    public void UpdateTrackLock(int trackId, decimal listenedSeconds)
    {
        if (CurrentTrackId == trackId)
        {
            if (listenedSeconds > (CurrentTrackMinListenedSeconds ?? 0))
                CurrentTrackMinListenedSeconds = listenedSeconds;
        }
        else
        {
            CurrentTrackId = trackId;
            CurrentTrackMinListenedSeconds = listenedSeconds;
        }
    }

    // --- Réservé aux tests/seed E2E ---

    internal static GameSession Restore(
        Guid playerId,
        int dailyChallengeId,
        int id = 0,
        int totalScore = 0,
        decimal totalDurationSeconds = 0m,
        DateTime? createdAt = null,
        SessionStatus status = SessionStatus.Pending,
        DateTime? completedAt = null,
        DateTime? abandonedAt = null,
        int? currentTrackId = null,
        decimal? currentTrackMinListenedSeconds = null) => new()
        {
            Id = id,
            PlayerId = playerId,
            DailyChallengeId = dailyChallengeId,
            TotalScore = totalScore,
            TotalDurationSeconds = totalDurationSeconds,
            CreatedAt = createdAt ?? DateTime.UtcNow,
            Status = status,
            CompletedAt = completedAt,
            AbandonedAt = abandonedAt,
            CurrentTrackId = currentTrackId,
            CurrentTrackMinListenedSeconds = currentTrackMinListenedSeconds,
        };

    // Aucun handler de production ne relocalise jamais une session vers un autre défi —
    // réservé aux tests qui simulent le passage de minuit (ex: SessionEdgeCaseTests).
    internal void RelocateToChallengeForTesting(int dailyChallengeId) => DailyChallengeId = dailyChallengeId;
}

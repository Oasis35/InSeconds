namespace InSeconds.Api.Domain;

public sealed class Player
{
    public Guid Id { get; private set; }
    public bool IsGuest { get; private set; }
    public string? Pseudo { get; private set; }
    public string? Email { get; private set; }
    public Guid AuthToken { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? LastSeenAt { get; private set; }
    public int CurrentStreak { get; private set; }
    public DateOnly? LastPlayedDate { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public bool IsAdmin { get; private set; }

    public ICollection<GameSession> GameSessions { get; set; } = [];

    private Player() { } // EF Core

    public static Player CreateGuest(Guid id, Guid authToken, DateTime createdAt) => new()
    {
        Id = id,
        IsGuest = true,
        AuthToken = authToken,
        CreatedAt = createdAt,
    };

    public void RecordSeen(DateTime now) => LastSeenAt = now;

    // Streak basée sur la date du défi, jamais la date de complétion (piège 18 CLAUDE.md racine).
    public void RecordChallengeCompletion(DateOnly challengeDate)
    {
        CurrentStreak = LastPlayedDate == challengeDate.AddDays(-1) ? CurrentStreak + 1 : 1;
        LastPlayedDate = challengeDate;
    }

    public void LinkToAccount(string email, string pseudo)
    {
        IsGuest = false;
        Email = email;
        Pseudo = pseudo;
    }

    public void UpdatePseudo(string pseudo) => Pseudo = pseudo;

    public void ChangeEmail(string newEmail) => Email = newEmail;

    public void Delete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
    }

    // --- Réservé aux tests/seed E2E ---

    // IsAdmin volontairement absent des paramètres nommés de Restore() : l'attribution du
    // rôle est hors application par design (SQL manuel en prod, cf. Admin/CheckAdminAuth) —
    // seul le mutateur dédié ci-dessous existe pour les tests/le bypass E2E Testing-only.
    internal static Player Restore(
        Guid id,
        Guid authToken,
        DateTime createdAt,
        bool isGuest = true,
        string? pseudo = null,
        string? email = null,
        DateTime? lastSeenAt = null,
        int currentStreak = 0,
        DateOnly? lastPlayedDate = null,
        bool isDeleted = false,
        DateTime? deletedAt = null) => new()
        {
            Id = id,
            IsGuest = isGuest,
            Pseudo = pseudo,
            Email = email,
            AuthToken = authToken,
            CreatedAt = createdAt,
            LastSeenAt = lastSeenAt,
            CurrentStreak = currentStreak,
            LastPlayedDate = lastPlayedDate,
            IsDeleted = isDeleted,
            DeletedAt = deletedAt,
        };

    internal void RestoreStreakForTesting(int currentStreak, DateOnly? lastPlayedDate)
    {
        CurrentStreak = currentStreak;
        LastPlayedDate = lastPlayedDate;
    }

    // Utilisé par POST /api/e2e/login-as-admin (Testing-only, Features/E2E/ResetEndpoint.cs)
    // et par les tests (AdminCookieAuthorizationTests, CookieAuthServiceTests) — jamais de
    // chemin de production qui pose IsAdmin=true (cf. décision "hors application" ci-dessus).
    internal void PromoteToAdminForTesting() => IsAdmin = true;
}

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
    // Gels de série en stock — comptes connectés uniquement (toujours 0 pour un invité).
    public int StreakFreezes { get; private set; }
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

    // Gel offert à la conversion invité → compte.
    public const int SignupFreezeGift = 1;

    // Streak basée sur la date du défi, jamais la date de complétion (piège 18 CLAUDE.md racine).
    // Compte connecté : chaque jour manqué consomme un gel (la série ne monte pas pour ce jour
    // mais ne casse pas) ; pas assez de gels → la série repart à 1. +1 gel à chaque multiple de
    // FreezeEveryDays jours de série, dans la limite de FreezeMax.
    public StreakCompletionResult RecordChallengeCompletion(DateOnly challengeDate, StreakRules rules)
    {
        var missed = LastPlayedDate is { } last ? challengeDate.DayNumber - last.DayNumber - 1 : -1;
        var freezesUsed = 0;

        if (missed == 0)
        {
            CurrentStreak++;
        }
        else if (!IsGuest && missed > 0 && missed <= StreakFreezes)
        {
            StreakFreezes -= missed;
            freezesUsed = missed;
            CurrentStreak++;
        }
        else
        {
            CurrentStreak = 1;
        }

        LastPlayedDate = challengeDate;

        var freezeEarned = !IsGuest
            && rules.FreezeEveryDays > 0
            && CurrentStreak % rules.FreezeEveryDays == 0
            && StreakFreezes < rules.FreezeMax;
        if (freezeEarned)
            StreakFreezes++;

        return new StreakCompletionResult(freezesUsed, freezeEarned);
    }

    // Vue de la série depuis `today`, sans requête : corrige l'affichage d'une série cassée
    // (CurrentStreak n'est recalculé qu'à la complétion et resterait figé sinon).
    public StreakView GetStreakView(DateOnly today, StreakRules rules)
        => ComputeStreakView(IsGuest, CurrentStreak, LastPlayedDate, StreakFreezes, today, rules);

    // Variante statique pour les endpoints qui projettent les colonnes en SQL sans charger
    // l'entité (peek GET /api/sessions/today, GET /api/players/me).
    public static StreakView ComputeStreakView(
        bool isGuest, int currentStreak, DateOnly? lastPlayedDate, int streakFreezes, DateOnly today, StreakRules rules)
    {
        var missed = lastPlayedDate is { } last ? Math.Max(0, today.DayNumber - last.DayNumber - 1) : 0;

        var status = currentStreak == 0 || missed == 0 ? StreakStatus.Active
            : !isGuest && missed <= streakFreezes ? StreakStatus.Protected
            : StreakStatus.Broken;

        var streak = status == StreakStatus.Broken ? 0 : currentStreak;

        int? nextFreezeInDays = isGuest || rules.FreezeEveryDays <= 0
            ? null
            : rules.FreezeEveryDays - streak % rules.FreezeEveryDays;

        int? lostStreak = isGuest && status == StreakStatus.Broken && currentStreak >= rules.LostNudgeMinDays
            ? currentStreak
            : null;

        return new StreakView(
            status,
            streak,
            isGuest ? 0 : streakFreezes,
            isGuest ? 0 : rules.FreezeMax,
            isGuest ? 0 : rules.FreezeEveryDays,
            nextFreezeInDays,
            missed,
            lostStreak,
            lastPlayedDate);
    }

    public void LinkToAccount(string email, string pseudo)
    {
        IsGuest = false;
        Email = email;
        Pseudo = pseudo;
        StreakFreezes = Math.Max(StreakFreezes, SignupFreezeGift);
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
        int streakFreezes = 0,
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
            StreakFreezes = streakFreezes,
            IsDeleted = isDeleted,
            DeletedAt = deletedAt,
        };

    internal void RestoreStreakForTesting(int currentStreak, DateOnly? lastPlayedDate, int streakFreezes = 0)
    {
        CurrentStreak = currentStreak;
        LastPlayedDate = lastPlayedDate;
        StreakFreezes = streakFreezes;
    }

    // Utilisé par POST /api/e2e/login-as-admin (Testing-only, Features/E2E/ResetEndpoint.cs)
    // et par les tests (AdminCookieAuthorizationTests, CookieAuthServiceTests) — jamais de
    // chemin de production qui pose IsAdmin=true (cf. décision "hors application" ci-dessus).
    internal void PromoteToAdminForTesting() => IsAdmin = true;
}

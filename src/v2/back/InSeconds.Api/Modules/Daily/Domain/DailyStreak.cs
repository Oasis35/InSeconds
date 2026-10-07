namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Réglages du gel de série, relus à chaud (<c>Daily:StreakFreezeEveryDays</c>, <c>StreakFreezeMax</c>, <c>StreakLostNudgeMinDays</c>).</summary>
/// <param name="FreezeEveryDays">+1 gel à chaque multiple de ce nombre de jours de série (0 : aucun gel gagné).</param>
/// <param name="FreezeMax">Stock maximum de gels.</param>
/// <param name="LostNudgeMinDays">Série perdue d'au moins ce nombre de jours : un invité en est averti.</param>
public sealed record StreakRules(int FreezeEveryDays, int FreezeMax, int LostNudgeMinDays);

public enum StreakStatus
{
    /// <summary>La série continue (jour joué, ou pas encore de jour manqué).</summary>
    Active,

    /// <summary>Des jours ont été manqués, couverts par les gels : la série tient.</summary>
    Protected,

    /// <summary>Perdue.</summary>
    Broken,
}

/// <summary>
/// La série effective d'un joueur, vue d'un jour donné (v1 : <c>StreakView</c>). Calculée à la lecture : la série stockée ne se
/// recalcule qu'à la complétion d'une partie, et resterait figée sinon.
/// </summary>
/// <param name="Freezes">Gels en stock, déduction faite de ceux déjà engagés sur les jours manqués d'une série protégée.</param>
/// <param name="NextFreezeInDays">Jours de série restants avant le prochain gel (vide pour un invité ou sans gel gagné).</param>
/// <param name="MissedDays">Jours manqués depuis le dernier défi terminé (aujourd'hui exclu).</param>
/// <param name="LostStreak">Série perdue d'un invité, au-dessus du seuil d'incitation (sinon vide).</param>
public sealed record StreakView(
    StreakStatus Status, int Streak, int Freezes, int MaxFreezes, int FreezeEveryDays, int? NextFreezeInDays, int MissedDays, int? LostStreak, DateOnly? LastPlayedDate);

/// <summary>Ce qu'une complétion a changé aux gels : relu pour les toasts de fin de partie.</summary>
public sealed record StreakCompletion(int FreezesUsed, bool FreezeEarned);

/// <summary>
/// La série d'un joueur et son stock de gels (§ 4.4 du plan v2, table <c>streaks</c> : elle n'existe que pour ce mode). Pas de ligne =
/// aucune série. **Toujours calculée sur la date du défi**, jamais sur la date de la complétion (piège 18) : terminer le défi de la
/// veille après minuit ne casse pas la série. Les règles sont celles de la v1.
/// </summary>
public sealed class DailyStreak
{
    private DailyStreak()
    {
    }

    public Guid PlayerId { get; private set; }

    public int CurrentStreak { get; private set; }

    public DateOnly? LastPlayedDate { get; private set; }

    /// <summary>Gels en stock : toujours 0 pour un invité.</summary>
    public short Freezes { get; private set; }

    /// <summary>Gel offert à la création d'un compte (v1 : <c>Player.SignupFreezeGift</c>).</summary>
    public const int AccountCreationFreezeGift = 1;

    public static DailyStreak Create(Guid playerId) => new() { PlayerId = playerId };

    /// <summary>
    /// Compte lié : chaque jour manqué consomme un gel (la série ne monte pas pour ce jour mais ne casse pas) ; pas assez de gels, la
    /// série repart à 1. +1 gel à chaque multiple de <see cref="StreakRules.FreezeEveryDays"/> jours de série, dans la limite du stock
    /// maximum. Un invité n'a ni gel consommé ni gel gagné.
    /// </summary>
    public StreakCompletion RecordCompletion(DateOnly challengeDate, bool isLinked, StreakRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var missed = LastPlayedDate is { } last ? challengeDate.DayNumber - last.DayNumber - 1 : -1;
        var freezesUsed = 0;

        if (missed == 0)
        {
            CurrentStreak++;
        }
        else if (isLinked && missed > 0 && missed <= Freezes)
        {
            Freezes -= (short)missed;
            freezesUsed = missed;
            CurrentStreak++;
        }
        else
        {
            CurrentStreak = 1;
        }

        LastPlayedDate = challengeDate;

        var freezeEarned = isLinked
            && rules.FreezeEveryDays > 0
            && CurrentStreak % rules.FreezeEveryDays == 0
            && Freezes < rules.FreezeMax;
        if (freezeEarned)
            Freezes++;

        return new StreakCompletion(freezesUsed, freezeEarned);
    }

    /// <summary>Un compte vient d'être créé (conversion d'un invité ou nouveau joueur) : le stock passe à au moins un gel.</summary>
    public void GrantAccountCreationFreeze() => Freezes = (short)Math.Max((int)Freezes, AccountCreationFreezeGift);

    public StreakView View(DateOnly today, bool isLinked, StreakRules rules) =>
        Compute(CurrentStreak, LastPlayedDate, Freezes, today, isLinked, rules);

    /// <summary>La série d'un joueur sans ligne : aucune.</summary>
    public static StreakView None(DateOnly today, bool isLinked, StreakRules rules) => Compute(0, null, 0, today, isLinked, rules);

    /// <summary>La même vue sans charger l'entité (les lectures projettent les colonnes).</summary>
    public static StreakView Compute(
        int currentStreak, DateOnly? lastPlayedDate, int freezes, DateOnly today, bool isLinked, StreakRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var missed = lastPlayedDate is { } last ? Math.Max(0, today.DayNumber - last.DayNumber - 1) : 0;

        var status = currentStreak == 0 || missed == 0 ? StreakStatus.Active
            : isLinked && missed <= freezes ? StreakStatus.Protected
            : StreakStatus.Broken;

        var streak = status == StreakStatus.Broken ? 0 : currentStreak;

        // Série protégée : les gels qui couvrent les jours manqués ne sont retirés du stock qu'à la complétion, mais ils sont déjà
        // engagés. On montre le stock restant (sinon la gélule afficherait encore le stock plein alors que l'accueil annonce qu'un gel
        // a servi, bug signalé en v1 le 2026-09-29).
        var shownFreezes = status == StreakStatus.Protected ? freezes - missed : freezes;

        int? nextFreezeInDays = !isLinked || rules.FreezeEveryDays <= 0
            ? null
            : rules.FreezeEveryDays - streak % rules.FreezeEveryDays;

        int? lostStreak = !isLinked && status == StreakStatus.Broken && currentStreak >= rules.LostNudgeMinDays
            ? currentStreak
            : null;

        return new StreakView(
            status,
            streak,
            isLinked ? shownFreezes : 0,
            isLinked ? rules.FreezeMax : 0,
            isLinked ? rules.FreezeEveryDays : 0,
            nextFreezeInDays,
            missed,
            lostStreak,
            lastPlayedDate);
    }
}

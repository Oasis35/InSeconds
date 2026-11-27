namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Rejoue la série d'un joueur depuis ses seuls jours de défi terminés, dans l'ordre, avec la règle de jeu (<see cref="DailyStreak.RecordCompletion"/>) :
/// c'est la série qu'il aurait eue si l'historique commençait au premier de ces jours. Utilisé quand on efface les jours anciens
/// (<c>--purge-daily-before</c>) : les séries stockées comptent des jours disparus.
/// </summary>
public static class StreakReplay
{
    /// <summary>
    /// Un compte part avec le gel offert à sa création (<see cref="DailyStreak.AccountCreationFreezeGift"/>) : le gel déjà consommé avant la date limite
    /// ne se retrouve pas, c'est l'approximation retenue. Aucun jour terminé : pas de série (<c>null</c>).
    /// </summary>
    public static DailyStreak? Run(Guid playerId, IEnumerable<DateOnly> completedDays, bool isLinked, StreakRules rules)
    {
        ArgumentNullException.ThrowIfNull(completedDays);
        var days = completedDays.Distinct().Order().ToList();
        if (days.Count == 0)
            return null;

        var streak = DailyStreak.Create(playerId);
        if (isLinked)
            streak.GrantAccountCreationFreeze();
        foreach (var day in days)
            streak.RecordCompletion(day, isLinked, rules);
        return streak;
    }
}

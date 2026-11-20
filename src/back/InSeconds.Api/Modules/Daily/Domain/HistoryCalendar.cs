namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Ce que le joueur a fait d'un défi du mois, lu en base : sa partie (vide : aucune), son score et le nombre de ses réponses.</summary>
public sealed record HistoryCalendarInput(DateOnly Date, int TrackCount, SessionStatus? Status, int Score, int AnswerCount);

/// <summary>Une case du calendrier de l'historique.</summary>
/// <param name="State">L'état de la case, une valeur de <see cref="HistoryDayState"/>.</param>
/// <param name="Score">Le score d'une partie terminée ; vide sinon.</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute de la teinte.</param>
public sealed record HistoryCalendarDay(DateOnly Date, string State, int? Score, int MaxPossibleScore);

/// <summary>Les chiffres d'un mois : ses parties terminées sur les jours qu'il pouvait jouer, leur moyenne et la meilleure.</summary>
public sealed record HistoryMonthStats(int PlayedCount, int PublishedCount, int? AverageScore, int? BestScore);

/// <summary>Les états d'une case du calendrier. Des chaînes stables : le front les lit.</summary>
public static class HistoryDayState
{
    /// <summary>Partie terminée : la case porte le score.</summary>
    public const string Played = "played";

    /// <summary>Partie commencée (au moins une réponse) mais pas terminée : abandonnée, expirée, ou la veille encore en cours.</summary>
    public const string Unfinished = "unfinished";

    /// <summary>Défi passé que le joueur n'a pas joué (ou abandonné sans répondre).</summary>
    public const string Missed = "missed";

    /// <summary>Le défi du jour, pas encore terminé.</summary>
    public const string Today = "today";
}

/// <summary>
/// Le calendrier du mois de l'historique, calcul pur : l'état de chaque jour de défi jusqu'à aujourd'hui et les chiffres du mois. Toujours la
/// date du défi, jamais l'heure de fin de la partie (piège 18) : une partie de la veille finie après minuit tombe sur la veille.
/// </summary>
public static class HistoryCalendar
{
    public static IReadOnlyList<HistoryCalendarDay> Days(IEnumerable<HistoryCalendarInput> days, DateOnly today, int bestStepScore) =>
        days.Where(d => d.Date <= today)
            .OrderBy(d => d.Date)
            .Select(d => new HistoryCalendarDay(
                d.Date, StateOf(d, today), d.Status == SessionStatus.Completed ? d.Score : null, d.TrackCount * bestStepScore))
            .ToList();

    public static string StateOf(HistoryCalendarInput day, DateOnly today)
    {
        if (day.Status == SessionStatus.Completed)
            return HistoryDayState.Played;
        if (day.Date == today && day.Status is null or SessionStatus.Pending)
            return HistoryDayState.Today;
        return day.Status is not null && day.AnswerCount > 0 ? HistoryDayState.Unfinished : HistoryDayState.Missed;
    }

    /// <summary>Les chiffres du mois : les jours qu'il pouvait jouer sont ceux d'avant aujourd'hui, plus aujourd'hui s'il l'a terminé.</summary>
    public static HistoryMonthStats Stats(IReadOnlyList<HistoryCalendarDay> days, DateOnly today)
    {
        var scores = days.Where(d => d.Score is not null).Select(d => d.Score!.Value).ToList();
        var published = days.Count(d => d.Date < today || d.State == HistoryDayState.Played);
        return scores.Count == 0
            ? new HistoryMonthStats(0, published, null, null)
            : new HistoryMonthStats(scores.Count, published, (int)Math.Round(scores.Average(), MidpointRounding.AwayFromZero), scores.Max());
    }
}

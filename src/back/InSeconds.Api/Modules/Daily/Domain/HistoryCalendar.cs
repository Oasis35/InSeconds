namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Ce que le joueur a fait d'un défi du mois, lu en base : sa partie (vide : aucune), son score et le nombre de ses réponses.</summary>
public sealed record HistoryCalendarInput(DateOnly Date, int TrackCount, SessionStatus? Status, int Score, int AnswerCount);

/// <summary>L'état d'un jour de défi pour le joueur.</summary>
public enum HistoryDayKind
{
    /// <summary>Partie terminée : la case porte le score.</summary>
    Played,

    /// <summary>Partie commencée (au moins une réponse) qu'il ne peut plus jouer : abandonnée ou expirée.</summary>
    Unfinished,

    /// <summary>La veille, encore en cours : elle se finit sur le défi (piège 18), ses réponses ne s'ouvrent pas encore depuis le calendrier.</summary>
    Resumable,

    /// <summary>Défi passé que le joueur n'a pas joué (ou abandonné sans répondre).</summary>
    Missed,

    /// <summary>Le défi du jour, pas encore terminé.</summary>
    Today,
}

/// <summary>Une case du calendrier de l'historique.</summary>
/// <param name="Score">Le score d'une partie terminée ; vide sinon.</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute de la teinte.</param>
public sealed record HistoryCalendarDay(DateOnly Date, HistoryDayKind State, int? Score, int MaxPossibleScore);

/// <summary>Les chiffres d'un mois : ses parties terminées sur les jours qu'il pouvait jouer, leur moyenne et la meilleure.</summary>
public sealed record HistoryMonthStats(int PlayedCount, int PublishedCount, int? AverageScore, int? BestScore);

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

    public static HistoryDayKind StateOf(HistoryCalendarInput day, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(day);
        if (day.Status == SessionStatus.Completed)
            return HistoryDayKind.Played;
        if (day.Date == today && day.Status is null or SessionStatus.Pending)
            return HistoryDayKind.Today;
        // Une partie encore en cours sur un défi passé : la veille, qui se finit après minuit (une plus vieille est refusée, puis expirée).
        if (day.Status == SessionStatus.Pending)
            return HistoryDayKind.Resumable;
        return day.Status is not null && day.AnswerCount > 0 ? HistoryDayKind.Unfinished : HistoryDayKind.Missed;
    }

    /// <summary>Les chiffres du mois : les jours qu'il pouvait jouer sont ceux d'avant aujourd'hui, plus aujourd'hui s'il l'a terminé.</summary>
    public static HistoryMonthStats Stats(IReadOnlyList<HistoryCalendarDay> days, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(days);
        var scores = days.Where(d => d.Score is not null).Select(d => d.Score!.Value).ToList();
        var published = days.Count(d => d.Date < today || d.State == HistoryDayKind.Played);
        return scores.Count == 0
            ? new HistoryMonthStats(0, published, null, null)
            : new HistoryMonthStats(scores.Count, published, (int)Math.Round(scores.Average(), MidpointRounding.AwayFromZero), scores.Max());
    }
}

using System.Diagnostics.Metrics;
using System.Globalization;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Métriques OpenTelemetry du défi du jour, lues par le tableau Grafana « Activité » (<c>deploy/grafana/</c>) : des compteurs plutôt que des
/// regex sur le texte des journaux. Aucun identifiant de joueur ni de morceau en étiquette (cardinalité bornée : paliers, niveaux d'indice,
/// trouvé ou non). Noms côté Prometheus : <c>inseconds_daily_sessions_total</c>, <c>inseconds_daily_answers_total</c>,
/// <c>inseconds_daily_hints_total</c>, <c>inseconds_daily_session_score_bucket</c>.
/// </summary>
public sealed class DailyMetrics
{
    public const string MeterName = "InSeconds.Daily";

    public const string SessionsName = "inseconds.daily.sessions";
    public const string AnswersName = "inseconds.daily.answers";
    public const string HintsName = "inseconds.daily.hints";
    public const string SessionScoreName = "inseconds.daily.session.score";

    /// <summary>Étiquette <c>event</c> des parties : démarrée, terminée, abandonnée (clic), expirée (laissée en cours, la nuit).</summary>
    public const string Started = "started";
    public const string Completed = "completed";
    public const string Abandoned = "abandoned";
    public const string Expired = "expired";

    // Score d'une partie : 1 000 points au plus par morceau, 5 morceaux par défaut.
    private static readonly IReadOnlyList<int> ScoreBuckets = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 7500, 10000];

    private readonly Counter<long> _sessions;
    private readonly Counter<long> _answers;
    private readonly Counter<long> _hints;
    private readonly Histogram<int> _sessionScore;

    public DailyMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _sessions = meter.CreateCounter<long>(SessionsName, description: "Parties du défi du jour, par événement (event).");
        _answers = meter.CreateCounter<long>(AnswersName, description: "Réponses données, par palier écouté, niveau d'indice, artiste et titre trouvés.");
        _hints = meter.CreateCounter<long>(HintsName, description: "Indices demandés, par niveau.");
        _sessionScore = meter.CreateHistogram(
            SessionScoreName, description: "Score total d'une partie terminée.",
            advice: new InstrumentAdvice<int> { HistogramBucketBoundaries = ScoreBuckets });
    }

    public void SessionStarted() => _sessions.Add(1, new KeyValuePair<string, object?>("event", Started));

    public void SessionAbandoned() => _sessions.Add(1, new KeyValuePair<string, object?>("event", Abandoned));

    public void SessionsExpired(int count)
    {
        if (count > 0)
            _sessions.Add(count, new KeyValuePair<string, object?>("event", Expired));
    }

    public void SessionCompleted(int totalScore)
    {
        _sessions.Add(1, new KeyValuePair<string, object?>("event", Completed));
        _sessionScore.Record(totalScore);
    }

    /// <summary>Le palier en texte invariant (« 0.5 », « 10 », « 0 » pour un morceau sans extrait passé), pour une étiquette stable.</summary>
    public void AnswerSubmitted(RoundOutcome outcome) =>
        _answers.Add(1,
            new KeyValuePair<string, object?>("listened_seconds", outcome.ListenedSeconds.ToString("0.##", CultureInfo.InvariantCulture)),
            new KeyValuePair<string, object?>("hint_level", outcome.HintLevelUsed),
            new KeyValuePair<string, object?>("artist_found", outcome.ArtistCorrect),
            new KeyValuePair<string, object?>("title_found", outcome.TitleCorrect));

    public void HintRequested(int level) => _hints.Add(1, new KeyValuePair<string, object?>("hint_level", level));
}

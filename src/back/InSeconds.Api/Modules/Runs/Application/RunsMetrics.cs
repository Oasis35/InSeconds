using System.Diagnostics.Metrics;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Métriques OpenTelemetry du mode Run, pour le tableau Grafana « Activité » : des compteurs plutôt que des regex sur le texte des journaux. Aucun
/// identifiant de joueur, de morceau ni de playlist en étiquette (cardinalité bornée : événement, manche, trouvé ou non, disque). Noms côté Prometheus :
/// <c>inseconds_runs_sessions_total</c>, <c>inseconds_runs_answers_total</c>, <c>inseconds_runs_neutralized_total</c>, <c>inseconds_runs_discs_total</c>.
/// </summary>
public sealed class RunsMetrics
{
    public const string MeterName = "InSeconds.Runs";

    public const string SessionsName = "inseconds.runs.sessions";
    public const string AnswersName = "inseconds.runs.answers";
    public const string NeutralizedName = "inseconds.runs.neutralized";
    public const string DiscsName = "inseconds.runs.discs";

    /// <summary>Étiquette <c>event</c> des parties : run lancé (nouvelle playlist), playlist relevée, gagnée, perdue, abandonnée.</summary>
    public const string Launched = "launched";
    public const string Joined = "joined";
    public const string Won = "won";
    public const string Lost = "lost";
    public const string Abandoned = "abandoned";

    private readonly Counter<long> _sessions;
    private readonly Counter<long> _answers;
    private readonly Counter<long> _neutralized;
    private readonly Counter<long> _discs;

    public RunsMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _sessions = meter.CreateCounter<long>(SessionsName, description: "Parties du mode Run, par événement (event).");
        _answers = meter.CreateCounter<long>(AnswersName, description: "Réponses données, par manche, artiste et titre trouvés.");
        _neutralized = meter.CreateCounter<long>(NeutralizedName, description: "Morceaux neutralisés (Deezer n'a plus d'extrait).");
        _discs = meter.CreateCounter<long>(DiscsName, description: "Disques obtenus à la fin d'une partie gagnée ou perdue, par clé (disc).");
    }

    public void RunLaunched() => Session(Launched);

    public void SessionJoined() => Session(Joined);

    public void SessionAbandoned() => Session(Abandoned);

    /// <summary>La fin d'une partie gagnée ou perdue, avec le disque obtenu.</summary>
    public void SessionEnded(bool won, string disc)
    {
        Session(won ? Won : Lost);
        _discs.Add(1, new KeyValuePair<string, object?>("disc", disc));
    }

    public void AnswerSubmitted(RoundOutcome outcome, int round) =>
        _answers.Add(1,
            new KeyValuePair<string, object?>("round", round),
            new KeyValuePair<string, object?>("artist_found", outcome.ArtistCorrect),
            new KeyValuePair<string, object?>("title_found", outcome.TitleCorrect));

    public void TrackNeutralized() => _neutralized.Add(1);

    private void Session(string @event) => _sessions.Add(1, new KeyValuePair<string, object?>("event", @event));
}

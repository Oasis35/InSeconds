using System.Diagnostics.Metrics;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Métriques OpenTelemetry du mode Run, pour le tableau Grafana « Activité » : des compteurs plutôt que des regex sur le texte des journaux. Aucun
/// identifiant de joueur, de morceau ni de playlist en étiquette (cardinalité bornée : événement, manche, trouvé ou non, palier, disque de niveau).
/// Noms côté Prometheus : <c>inseconds_runs_sessions_total</c>, <c>inseconds_runs_answers_total</c>, <c>inseconds_runs_neutralized_total</c>,
/// <c>inseconds_runs_rounds_total</c>, <c>inseconds_runs_duels_total</c>,
/// <c>inseconds_runs_levels_total</c>.
/// </summary>
public sealed class RunsMetrics
{
    public const string MeterName = "InSeconds.Runs";

    public const string SessionsName = "inseconds.runs.sessions";
    public const string AnswersName = "inseconds.runs.answers";
    public const string NeutralizedName = "inseconds.runs.neutralized";
    public const string RoundsName = "inseconds.runs.rounds";
    public const string DuelsName = "inseconds.runs.duels";
    public const string LevelsName = "inseconds.runs.levels";

    /// <summary>Étiquette <c>change</c> du niveau après une partie : un disque de plus (<c>up</c>), de moins (<c>down</c>) ou le même (<c>same</c>).</summary>
    public const string LevelUp = "up";
    public const string LevelDown = "down";
    public const string LevelSame = "same";

    /// <summary>L'étiquette <c>disc</c> d'un joueur sous le premier disque.</summary>
    public const string NoDisc = "none";

    /// <summary>Étiquette <c>result</c> d'un duel : le joueur devant l'ami (<c>ahead</c>), derrière (<c>behind</c>) ou à égalité (<c>tied</c>).</summary>
    public const string DuelAhead = "ahead";
    public const string DuelBehind = "behind";
    public const string DuelTied = "tied";

    /// <summary>Étiquette <c>event</c> des parties : run lancé (nouvelle playlist), playlist relevée, perdue (plus de vie), abandonnée.</summary>
    public const string Launched = "launched";
    public const string Joined = "joined";
    public const string Lost = "lost";
    public const string Completed = "completed";
    public const string Abandoned = "abandoned";

    private readonly Counter<long> _sessions;
    private readonly Counter<long> _answers;
    private readonly Counter<long> _neutralized;
    private readonly Counter<long> _rounds;
    private readonly Counter<long> _duels;
    private readonly Counter<long> _levels;

    public RunsMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _sessions = meter.CreateCounter<long>(SessionsName, description: "Parties du mode Run, par événement (event).");
        _answers = meter.CreateCounter<long>(AnswersName, description: "Réponses données, par manche, artiste et titre trouvés.");
        _neutralized = meter.CreateCounter<long>(NeutralizedName, description: "Morceaux neutralisés (Deezer n'a plus d'extrait).");
        _rounds = meter.CreateCounter<long>(RoundsName, description: "Manches terminées, par manche (round) et résultat (outcome : shorter, same, longer).");
        _levels = meter.CreateCounter<long>(LevelsName, description: "Niveaux recalculés à la fin d'une partie, par disque de niveau (disc), changement (change) et provisoire (provisional).");
        _duels = meter.CreateCounter<long>(DuelsName, description: "Duels finis contre l'ami qui a lancé la playlist, par résultat (result : devant, derrière, égalité).");
    }

    public void RunLaunched() => Session(Launched);

    public void SessionJoined() => Session(Joined);

    public void SessionAbandoned() => Session(Abandoned);

    /// <summary>
    /// La fin d'une partie : perdue (plus de vie ; <c>round</c> : la manche où la dernière vie est tombée) ou « Série complète » (<c>completed</c>,
    /// le plafond de manches atteint ; <c>round</c> : la dernière manche), avec le nombre de manches terminées, pour régler les paliers.
    /// </summary>
    public void SessionEnded(int roundsPassed, bool completed = false) =>
        _sessions.Add(1, new KeyValuePair<string, object?>("event", completed ? Completed : Lost), new KeyValuePair<string, object?>("round", completed ? roundsPassed : roundsPassed + 1));

    /// <summary>Une manche terminée : son numéro et ce qu'elle a fait du palier (<c>shorter</c>, <c>same</c>, <c>longer</c>).</summary>
    public void RoundEnded(int round, string outcome) =>
        _rounds.Add(1, new KeyValuePair<string, object?>("round", round), new KeyValuePair<string, object?>("outcome", outcome));

    /// <summary>La fin d'une partie jouée sur la playlist d'un ami qui l'a finie : le joueur est devant, derrière ou à égalité.</summary>
    public void DuelEnded(int gap) =>
        _duels.Add(1, new KeyValuePair<string, object?>("result", gap > 0 ? DuelAhead : gap < 0 ? DuelBehind : DuelTied));

    /// <summary>
    /// Le niveau après une série finie : son disque (<c>none</c> sous le premier), et s'il a gagné ou perdu un disque (<c>up</c>, <c>down</c>, <c>same</c>)
    /// par rapport au niveau d'avant la partie, inactivité déduite : la répartition des disques et les montées et baisses, pour régler les seuils.
    /// </summary>
    public void LevelChanged(string? disc, string change) =>
        _levels.Add(1,
            new KeyValuePair<string, object?>("disc", disc ?? NoDisc),
            new KeyValuePair<string, object?>("change", change switch { "up" => LevelUp, "down" => LevelDown, _ => LevelSame }));

    public void AnswerSubmitted(RoundOutcome outcome, int round) =>
        _answers.Add(1,
            new KeyValuePair<string, object?>("round", round),
            new KeyValuePair<string, object?>("artist_found", outcome.ArtistCorrect),
            new KeyValuePair<string, object?>("title_found", outcome.TitleCorrect));

    public void TrackNeutralized() => _neutralized.Add(1);

    private void Session(string @event) => _sessions.Add(1, new KeyValuePair<string, object?>("event", @event));
}

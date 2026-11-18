namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Ce qu'un joueur a déjà entendu en Survie, du plus récent au plus ancien : ses morceaux et les thèmes de ses manches (sans doublon). La mémoire de la
/// diversité du tirage ; elle se lit dans ses parties, rien n'est stocké à part.
/// </summary>
public sealed record RunHeardHistory(IReadOnlyList<int> TrackIds, IReadOnlyList<int> ThemeIds)
{
    public static RunHeardHistory Empty { get; } = new([], []);

    /// <summary>
    /// Assemble la mémoire depuis les morceaux répondus des parties du joueur : les plus récentes d'abord (identifiant de partie décroissant), dans une partie
    /// du dernier morceau au premier, sans doublon. Le thème d'une manche vient des règles figées de sa playlist.
    /// </summary>
    public static RunHeardHistory From(IEnumerable<HeardTrack> heard, IReadOnlyDictionary<int, RunRules> rulesByChallenge)
    {
        ArgumentNullException.ThrowIfNull(heard);
        ArgumentNullException.ThrowIfNull(rulesByChallenge);
        var ordered = heard.OrderByDescending(h => h.SessionId).ThenByDescending(h => h.Position).ToList();
        var themes = ordered
            .GroupBy(h => (h.SessionId, h.ChallengeId), (key, rows) => (key, Rounds: rows.Select(r => r.Round).Distinct().OrderByDescending(r => r).ToList()))
            .OrderByDescending(g => g.key.SessionId)
            .SelectMany(g => g.Rounds.Select(round => rulesByChallenge.TryGetValue(g.key.ChallengeId, out var rules) ? rules.ThemeOf(round)?.ThemeId : null))
            .OfType<int>();
        return new RunHeardHistory([.. ordered.Select(h => h.TrackId).Distinct()], [.. themes.Distinct()]);
    }
}

/// <summary>Un morceau répondu (et entendu) dans une partie : sa partie, sa playlist, sa position, son identifiant et sa manche.</summary>
public sealed record HeardTrack(int SessionId, int ChallengeId, int Position, int TrackId, int Round);

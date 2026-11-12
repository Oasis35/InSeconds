namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un morceau d'une partie finie, vu par les Hits : sa manche, s'il a été trouvé en entier (artiste et titre), s'il a été retiré.</summary>
public sealed record RunHitAnswer(int Position, int Round, bool Found, bool Neutralized);

/// <summary>Une partie finie (gagnée ou perdue) du joueur, réduite à ce que les Hits regardent.</summary>
/// <param name="Rounds">Le nombre de manches de sa playlist.</param>
/// <param name="TracksPerRound">Le nombre de morceaux d'une manche de sa playlist.</param>
/// <param name="Difficulties">La difficulté choisie, par manche (une manche sans choix n'y est pas).</param>
/// <param name="EarnedCard">Une carte y a été gagnée (l'Échange, offert, ne compte pas).</param>
/// <param name="FriendPoints">
/// Sur la playlist d'un ami qui l'a finie : les points de l'ami par position (le duel de l'écran de fin) ; vide sur sa propre playlist, ou si
/// l'auteur ne l'a pas finie.
/// </param>
public sealed record RunHitRun(
    bool Won, int TotalScore, int Rounds, int TracksPerRound, IReadOnlyDictionary<int, RunDifficulty> Difficulties,
    IReadOnlyList<RunHitAnswer> Answers, bool EarnedCard, IReadOnlyDictionary<int, int>? FriendPoints);

/// <summary>Ce que les Hits d'un joueur lisent : ses parties finies, de la plus ancienne à la plus récente, et si un ami a fini une de ses playlists.</summary>
public sealed record RunHitFacts(IReadOnlyList<RunHitRun> Runs, bool FriendPlayedMine);

/// <summary>Un Hit : son nom d'API, s'il est obtenu, et pour ceux qui se comptent, où en est le joueur.</summary>
public sealed record RunHit(string Key, bool Earned, int? Progress = null, int? Target = null);

/// <summary>
/// Les Hits du mode : des jalons obtenus en jouant, calculés à la lecture sur les parties finies du joueur (rien n'est stocké, donc rien à exporter ni
/// à effacer de plus). Un Hit obtenu le reste : chacun regarde tout l'historique, y compris les niveaux, jugés sur le plus haut niveau atteint.
/// </summary>
public static class RunHits
{
    public const string FirstSetlist = "first_setlist";
    public const string FirstRecord = "first_record";
    public const string FirstCard = "first_card";
    public const string FirstRiskyRound = "first_risky_round";
    public const string TenSetlists = "ten_setlists";
    public const string FiftySetlists = "fifty_setlists";
    public const string PerfectRound = "perfect_round";
    public const string TenInARow = "ten_in_a_row";
    public const string BossBeaten = "boss_beaten";
    public const string SetlistWon = "setlist_won";
    public const string GoldInRisky = "gold_in_risky";
    public const string FriendPlayed = "friend_played";
    public const string DuelWon = "duel_won";
    public const string FiveDuels = "five_duels";
    public const string LevelGold = "level_gold";
    public const string LevelDiamond = "level_diamond";

    private const int StreakTarget = 10;
    private const int DuelsTarget = 5;

    /// <param name="window">La fenêtre de la moyenne du niveau (<c>Runs:Levels:Window</c>).</param>
    /// <param name="provisionalRuns">Les parties pendant lesquelles le niveau est provisoire : il ne donne pas de Hit avant.</param>
    /// <param name="ladder">Les disques de niveau, du plus bas au plus haut.</param>
    public static IReadOnlyList<RunHit> Evaluate(RunHitFacts facts, int window, int provisionalRuns, IReadOnlyList<RunLevelStep> ladder)
    {
        ArgumentNullException.ThrowIfNull(facts);
        ArgumentNullException.ThrowIfNull(ladder);
        var runs = facts.Runs;
        var duels = runs.Count(WonDuel);
        var peak = PeakLevel(runs, window, provisionalRuns);

        return
        [
            new(FirstSetlist, runs.Count > 0),
            new(FirstRecord, BeatOwnRecord(runs)),
            new(FirstCard, runs.Any(r => r.EarnedCard)),
            new(FirstRiskyRound, runs.Any(r => r.Difficulties.Values.Contains(RunDifficulty.Risky))),
            Counted(TenSetlists, runs.Count, 10),
            Counted(FiftySetlists, runs.Count, 50),
            new(PerfectRound, runs.Any(HasPerfectRound)),
            new(TenInARow, runs.Any(r => LongestStreak(r) >= StreakTarget)),
            new(BossBeaten, runs.Any(BeatBoss)),
            new(SetlistWon, runs.Any(r => r.Won)),
            new(GoldInRisky, runs.Any(r => r.Won && r.Rounds > 1 && Enumerable.Range(2, r.Rounds - 1).All(round => IsRisky(r, round)))),
            new(FriendPlayed, facts.FriendPlayedMine),
            new(DuelWon, duels > 0),
            Counted(FiveDuels, duels, DuelsTarget),
            new(LevelGold, Reached(peak, ladder, "gold")),
            new(LevelDiamond, Reached(peak, ladder, "diamond")),
        ];
    }

    private static RunHit Counted(string key, int count, int target) => new(key, count >= target, Math.Min(count, target), target);

    /// <summary>Une partie a fait mieux que toutes celles d'avant (la première ne bat rien).</summary>
    private static bool BeatOwnRecord(IReadOnlyList<RunHitRun> runs)
    {
        for (var i = 1; i < runs.Count; i++)
        {
            if (runs[i].TotalScore > runs.Take(i).Max(r => r.TotalScore))
                return true;
        }

        return false;
    }

    /// <summary>Une manche jouée en entier, sans morceau retiré, artiste et titre trouvés à chaque morceau.</summary>
    private static bool HasPerfectRound(RunHitRun run) =>
        run.Answers.GroupBy(a => a.Round).Any(round => round.Count() >= run.TracksPerRound && round.All(a => a.Found && !a.Neutralized));

    /// <summary>La plus longue série de morceaux trouvés d'affilée dans la partie ; un morceau retiré ne la casse pas (comme à l'écran).</summary>
    internal static int LongestStreak(RunHitRun run)
    {
        var best = 0;
        var current = 0;
        foreach (var answer in run.Answers.OrderBy(a => a.Position))
        {
            if (answer.Neutralized)
                continue;
            current = answer.Found ? current + 1 : 0;
            best = Math.Max(best, current);
        }

        return best;
    }

    private static bool IsRisky(RunHitRun run, int round) => run.Difficulties.GetValueOrDefault(round) == RunDifficulty.Risky;

    /// <summary>La dernière manche passée en « Mélomane » : la manche boss.</summary>
    private static bool BeatBoss(RunHitRun run) => run.Won && run.Rounds > 1 && IsRisky(run, run.Rounds);

    /// <summary>Le duel de l'écran de fin, gagné : plus de points que l'ami sur les morceaux que le joueur a joués (<see cref="RunGhost"/>).</summary>
    private static bool WonDuel(RunHitRun run) =>
        run.FriendPoints is { } friend
        && run.TotalScore > RunGhost.TotalOver(friend, run.Answers.Where(a => !a.Neutralized).Select(a => a.Position));

    /// <summary>Le plus haut niveau atteint : la moyenne glissante rejouée partie après partie, sans compter les parties provisoires.</summary>
    internal static int PeakLevel(IReadOnlyList<RunHitRun> runs, int window, int provisionalRuns)
    {
        var scores = new List<int>(runs.Count);
        var peak = 0;
        foreach (var run in runs)
        {
            scores.Add(Math.Max(0, run.TotalScore));
            if (!RunLevelPolicy.IsProvisional(scores.Count, provisionalRuns))
                peak = Math.Max(peak, RunLevelPolicy.Points(scores, window));
        }

        return peak;
    }

    /// <summary>Le disque de niveau dont la clé finit par ce nom est atteint ; un disque absent de l'échelle ne s'obtient pas.</summary>
    private static bool Reached(int peak, IReadOnlyList<RunLevelStep> ladder, string disc) =>
        ladder.FirstOrDefault(s => s.Disc.EndsWith("." + disc, StringComparison.Ordinal)) is { } step && peak >= step.FromPoints;
}

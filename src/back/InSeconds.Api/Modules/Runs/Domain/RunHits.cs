namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un morceau d'une partie finie, vu par les Hits : sa manche, s'il a été trouvé en entier (artiste et titre), s'il a été retiré.</summary>
public sealed record RunHitAnswer(int Position, int Round, bool Found, bool Neutralized, decimal ListenSeconds = 10m, bool Failed = false);

/// <summary>Une partie finie (vies épuisées) du joueur, réduite à ce que les Hits regardent.</summary>
/// <param name="TracksPerRound">Le nombre de morceaux d'une manche de sa playlist.</param>
/// <param name="MysteryRounds">Les manches dont le joueur a choisi le thème mystère.</param>
/// <param name="FriendPoints">
/// Sur la playlist d'un ami qui l'a finie : les points de l'ami par position (le duel de l'écran de fin) ; vide sur sa propre playlist, ou si
/// l'auteur ne l'a pas finie.
/// </param>
/// <param name="EndedAt">La fin de la partie, pour rejouer l'inactivité du niveau ; vide : aucune inactivité comptée.</param>
public sealed record RunHitRun(
    int TotalScore, int TracksPerRound, IReadOnlyList<RunHitAnswer> Answers, IReadOnlyDictionary<int, int>? FriendPoints, IReadOnlySet<int>? MysteryRounds = null,
    DateTimeOffset? EndedAt = null);

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
    public const string TenSetlists = "ten_setlists";
    public const string FiftySetlists = "fifty_setlists";
    public const string PerfectRound = "perfect_round";
    public const string TenInARow = "ten_in_a_row";
    public const string FriendPlayed = "friend_played";
    public const string DuelWon = "duel_won";
    public const string FiveDuels = "five_duels";
    public const string EarGold = "ear_gold";
    public const string NoScratch = "no_scratch";
    public const string Marathon = "marathon";
    public const string MysterySolved = "mystery_solved";
    public const string LateGhost = "late_ghost";
    public const string LevelGold = "level_gold";
    public const string LevelDiamond = "level_diamond";

    private const int StreakTarget = 10;
    private const int DuelsTarget = 5;
    private const int MarathonTarget = 8;
    private const int NoScratchTarget = 3;
    private const decimal EarGoldSeconds = 0.5m;

    /// <param name="levels">Les règles du niveau (<c>Runs:Levels:</c>) : formule, inactivité et disques.</param>
    public static IReadOnlyList<RunHit> Evaluate(RunHitFacts facts, RunLevelRules levels)
    {
        ArgumentNullException.ThrowIfNull(facts);
        ArgumentNullException.ThrowIfNull(levels);
        var ladder = levels.Ladder;
        var runs = facts.Runs;
        var duels = runs.Count(WonDuel);
        var peak = PeakLevel(runs, levels);

        return
        [
            new(FirstSetlist, runs.Count > 0),
            new(FirstRecord, BeatOwnRecord(runs)),
            Counted(TenSetlists, runs.Count, 10),
            Counted(FiftySetlists, runs.Count, 50),
            new(PerfectRound, runs.Any(HasPerfectRound)),
            new(EarGold, runs.Any(HasEarGold)),
            new(NoScratch, runs.Any(r => LongestCleanRounds(r) >= NoScratchTarget)),
            Counted(Marathon, runs.Count == 0 ? 0 : runs.Max(r => CompleteRounds(r).Count), MarathonTarget),
            new(MysterySolved, runs.Any(HasMysterySolved)),
            new(TenInARow, runs.Any(r => LongestStreak(r) >= StreakTarget)),
            new(FriendPlayed, facts.FriendPlayedMine),
            new(DuelWon, duels > 0),
            new(LateGhost, runs.Any(BeatGhostLate)),
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

    /// <summary>Les manches jouées en entier (tous les morceaux répondus), de la première à la dernière, chacune avec ses réponses.</summary>
    private static List<IGrouping<int, RunHitAnswer>> CompleteRounds(RunHitRun run) =>
        [.. run.Answers.GroupBy(a => a.Round).Where(round => round.Count() >= run.TracksPerRound).OrderBy(round => round.Key)];

    /// <summary>Un morceau trouvé en entier à l'écoute du dernier palier : 0,5 s.</summary>
    private static bool HasEarGold(RunHitRun run) => run.Answers.Any(a => a.Found && !a.Neutralized && a.ListenSeconds <= EarGoldSeconds);

    /// <summary>Le plus grand nombre de manches jouées en entier de suite sans une seule vie perdue (un morceau retiré ne compte pas comme une erreur).</summary>
    internal static int LongestCleanRounds(RunHitRun run)
    {
        var best = 0;
        var current = 0;
        var previous = 0;
        foreach (var round in CompleteRounds(run))
        {
            var clean = round.All(a => !a.Failed);
            current = !clean ? 0 : current > 0 && round.Key == previous + 1 ? current + 1 : 1;
            previous = round.Key;
            best = Math.Max(best, current);
        }

        return best;
    }

    /// <summary>Une manche au thème mystère jouée en entier, tous ses morceaux (hors retirés) trouvés en entier.</summary>
    private static bool HasMysterySolved(RunHitRun run) =>
        run.MysteryRounds is { Count: > 0 } mystery
        && CompleteRounds(run).Any(round => mystery.Contains(round.Key) && round.Where(a => !a.Neutralized).All(a => a.Found) && round.Any(a => !a.Neutralized));

    /// <summary>Le joueur a dépassé l'ami après son arrêt : il a joué plus loin que lui et fait plus de points que son total.</summary>
    private static bool BeatGhostLate(RunHitRun run) =>
        run.FriendPoints is { Count: > 0 } friend
        && RunGhost.StoppedAt(friend, run.Answers.Count == 0 ? 0 : run.Answers.Max(a => a.Position)) is not null
        && run.TotalScore > friend.Values.Sum();

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

    /// <summary>Le duel de l'écran de fin, gagné : plus de points que l'ami sur les morceaux que le joueur a joués (<see cref="RunGhost"/>).</summary>
    private static bool WonDuel(RunHitRun run) =>
        run.FriendPoints is { } friend
        && run.TotalScore > RunGhost.TotalOver(friend, run.Answers.Where(a => !a.Neutralized).Select(a => a.Position));

    /// <summary>Le plus haut niveau atteint : la formule du niveau rejouée série après série, inactivité entre deux séries comprise.</summary>
    internal static int PeakLevel(IReadOnlyList<RunHitRun> runs, RunLevelRules levels)
    {
        var level = 0;
        DateTimeOffset? last = null;
        var peak = 0;
        foreach (var run in runs)
        {
            var before = last is { } at && run.EndedAt is { } end ? RunLevelPolicy.Now(level, at, end, levels).Points : level;
            level = RunLevelPolicy.Next(before, run.TotalScore, levels);
            last = run.EndedAt ?? last;
            peak = Math.Max(peak, level);
        }

        return peak;
    }

    /// <summary>Le disque de niveau dont la clé finit par ce nom est atteint ; un disque absent de l'échelle ne s'obtient pas.</summary>
    private static bool Reached(int peak, IReadOnlyList<RunLevelStep> ladder, string disc) =>
        ladder.FirstOrDefault(s => s.Disc.EndsWith("." + disc, StringComparison.Ordinal)) is { } step && peak >= step.FromPoints;
}

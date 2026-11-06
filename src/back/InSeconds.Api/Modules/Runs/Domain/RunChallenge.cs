namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Le défi d'un run : les morceaux tirés une fois pour toutes (4 manches de 5 au proto 1), les règles figées au moment du tirage, le code qui sert de
/// lien. Il ne dépend d'aucun joueur et ne change plus une fois créé. Sa graine est tirée au hasard et n'est jamais exposée.
/// </summary>
public sealed class RunChallenge
{
    private readonly List<RunChallengeTrack> _tracks = [];
    private readonly List<RunChallengeReserveTrack> _reserve = [];

    private RunChallenge()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence), pour que la création d'un run puisse le porter avant l'enregistrement.</summary>
    public int Id { get; private set; }

    /// <summary>Le lien du défi (6 caractères, <see cref="RunChallengeCode"/>), unique.</summary>
    public string Code { get; private set; } = "";

    public int Seed { get; private set; }

    public RunRules Rules { get; private set; } = null!;

    /// <summary>Son auteur, vide si son compte a été effacé (le défi reste jouable).</summary>
    public Guid? CreatedBy { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Les morceaux, par position (de 1 à N).</summary>
    public IReadOnlyList<RunChallengeTrack> Tracks => _tracks;

    /// <summary>
    /// Les morceaux de réserve de chaque manche, dans l'ordre où le coup de pouce « Joker » les sort : tirés avec la playlist, les mêmes pour tous ses
    /// joueurs. Ils ne comptent pas dans les morceaux du défi (<see cref="Tracks"/>) tant qu'aucun Joker ne les fait jouer.
    /// </summary>
    public IReadOnlyList<RunChallengeReserveTrack> Reserve => _reserve;

    /// <summary>La réserve d'une manche, dans l'ordre du tirage.</summary>
    public IEnumerable<RunChallengeReserveTrack> ReserveOf(int round) => _reserve.Where(r => r.Round == round).OrderBy(r => r.Rank);

    /// <param name="tracks">Les morceaux dans l'ordre du jeu, avec leur manche et leur multiplicateur.</param>
    /// <param name="reserve">
    /// Les morceaux de réserve, manche par manche (aucun pour une playlist du proto 1). Leur multiplicateur n'est pas gardé : un morceau sorti par
    /// un Joker prend la place, et donc le multiplicateur, du morceau qu'il remplace (le même : celui de la manche).
    /// </param>
    public static RunChallenge Create(
        string code, int seed, RunRules rules, IReadOnlyList<PlannedTrack> tracks, Guid? createdBy, DateTimeOffset now,
        IReadOnlyList<PlannedTrack>? reserve = null)
    {
        reserve ??= [];
        ArgumentNullException.ThrowIfNull(rules);
        if (RunChallengeCode.Normalize(code) != code)
            throw new ArgumentException("Code de défi invalide.", nameof(code));
        if (tracks.Count != rules.TrackCount)
            throw new ArgumentException("Un défi a exactement les morceaux que ses règles demandent.", nameof(tracks));
        if (tracks.Concat(reserve).Select(t => t.TrackId).Distinct().Count() != tracks.Count + reserve.Count)
            throw new ArgumentException("Un morceau ne figure qu'une fois dans un défi, réserve comprise.", nameof(tracks));
        if (reserve.Any(r => r.Round < 1 || r.Round > rules.Rounds))
            throw new ArgumentException("Un morceau de réserve appartient à une manche du défi.", nameof(reserve));

        var challenge = new RunChallenge { Code = code, Seed = seed, Rules = rules, CreatedBy = createdBy, CreatedAt = now };
        for (var i = 0; i < tracks.Count; i++)
            challenge._tracks.Add(new RunChallengeTrack((short)(i + 1), tracks[i].TrackId, (short)tracks[i].Round, tracks[i].Multiplier));
        foreach (var round in reserve.GroupBy(r => r.Round))
        {
            var rank = 0;
            foreach (var track in round)
                challenge._reserve.Add(new RunChallengeReserveTrack((short)round.Key, (short)++rank, track.TrackId));
        }

        return challenge;
    }
}

/// <summary>Un morceau d'un défi, à sa position : sa manche et le multiplicateur de points de cette manche. Il désigne le morceau par son identifiant (Catalogue).</summary>
public sealed class RunChallengeTrack
{
    private RunChallengeTrack()
    {
    }

    internal RunChallengeTrack(short position, int trackId, short round, decimal multiplier)
    {
        Position = position;
        TrackId = trackId;
        Round = round;
        Multiplier = multiplier;
    }

    public int ChallengeId { get; private set; }

    public short Position { get; private set; }

    public int TrackId { get; private set; }

    /// <summary>La manche, à partir de 1.</summary>
    public short Round { get; private set; }

    public decimal Multiplier { get; private set; }
}

/// <summary>
/// Un morceau de réserve d'un défi : sa manche et son rang dans la réserve de la manche (de 1 à N). Sans multiplicateur : celui de la position
/// qu'un Joker lui fait prendre.
/// </summary>
public sealed class RunChallengeReserveTrack
{
    private RunChallengeReserveTrack()
    {
    }

    internal RunChallengeReserveTrack(short round, short rank, int trackId)
    {
        Round = round;
        Rank = rank;
        TrackId = trackId;
    }

    public int ChallengeId { get; private set; }

    /// <summary>La manche, à partir de 1.</summary>
    public short Round { get; private set; }

    /// <summary>Son rang dans la réserve de la manche, à partir de 1 : le premier Joker sort le rang 1.</summary>
    public short Rank { get; private set; }

    public int TrackId { get; private set; }
}

/// <summary>Un morceau tiré, avant que le défi n'existe.</summary>
public sealed record PlannedTrack(int TrackId, int Round, decimal Multiplier);

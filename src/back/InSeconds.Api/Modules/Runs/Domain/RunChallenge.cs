namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Le défi d'une Série : une playlist qui se tire **à la volée**, manche après manche, à partir d'une graine, et que tous ses joueurs jouent dans le
/// même ordre (c'est ce qui rend le fantôme possible). La première manche est tirée à la création ; la suivante l'est quand le premier joueur y arrive
/// (<see cref="AppendRound"/>), avec le thème qu'il a choisi, et ne change plus : les joueurs qui arrivent après jouent les mêmes morceaux. Il porte les
/// règles figées au moment de la création et le code qui sert de lien. Sa graine est tirée au hasard et n'est jamais exposée.
/// </summary>
public sealed class RunChallenge
{
    private readonly List<RunChallengeTrack> _tracks = [];

    private RunChallenge()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence), pour que la création d'une Série puisse le porter avant l'enregistrement.</summary>
    public int Id { get; private set; }

    /// <summary>Le lien du défi (6 caractères, <see cref="RunChallengeCode"/>), unique.</summary>
    public string Code { get; private set; } = "";

    public int Seed { get; private set; }

    public RunRules Rules { get; private set; } = null!;

    /// <summary>Son auteur, vide si son compte a été effacé (le défi reste jouable).</summary>
    public Guid? CreatedBy { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Les morceaux tirés jusqu'ici, par position (de 1 à N, N croît d'une manche à chaque fois que quelqu'un va plus loin que les autres).</summary>
    public IReadOnlyList<RunChallengeTrack> Tracks => _tracks;

    /// <summary>Les manches déjà tirées.</summary>
    public int RoundsDrawn => _tracks.Count / Math.Max(1, Rules.TracksPerRound);

    /// <summary>Cette manche est déjà tirée (le premier joueur qui l'a atteinte l'a fixée pour tous).</summary>
    public bool HasRound(int round) => round <= RoundsDrawn;

    /// <summary>Le morceau de cette position, vide s'il n'est pas encore tiré.</summary>
    public RunChallengeTrack? TrackAt(int position) => _tracks.Find(t => t.Position == position);

    /// <summary>
    /// Ajoute la manche suivante : ses morceaux (autant que <see cref="RunRules.TracksPerRound"/>) et, s'il y en a un, son thème, figé avec la playlist.
    /// Les manches se tirent dans l'ordre, une seule fois.
    /// </summary>
    public void AppendRound(int round, IReadOnlyList<int> trackIds, RunRoundTheme? theme = null)
    {
        ArgumentNullException.ThrowIfNull(trackIds);
        if (round != RoundsDrawn + 1)
            throw new InvalidOperationException("Les manches se tirent dans l'ordre : la suivante est la manche " + (RoundsDrawn + 1) + ".");
        if (trackIds.Count != Rules.TracksPerRound)
            throw new ArgumentException("Une manche a exactement les morceaux que les règles demandent.", nameof(trackIds));
        if (trackIds.Distinct().Count() != trackIds.Count || trackIds.Any(id => _tracks.Exists(t => t.TrackId == id)))
            throw new ArgumentException("Un morceau ne figure qu'une fois dans un défi.", nameof(trackIds));
        if (theme is not null && theme.Round != round)
            throw new ArgumentException("Ce thème n'est pas celui de cette manche.", nameof(theme));

        for (var i = 0; i < trackIds.Count; i++)
            _tracks.Add(new RunChallengeTrack((short)(Rules.FirstPositionOf(round) + i), trackIds[i], (short)round));
        if (theme is not null)
            Rules = Rules with { Themes = [.. (Rules.Themes ?? []), theme] };
    }

    /// <param name="firstRound">Les morceaux de la première manche, dans l'ordre du jeu.</param>
    public static RunChallenge Create(string code, int seed, RunRules rules, IReadOnlyList<int> firstRound, Guid? createdBy, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(rules);
        if (RunChallengeCode.Normalize(code) != code)
            throw new ArgumentException("Code de défi invalide.", nameof(code));
        var challenge = new RunChallenge { Code = code, Seed = seed, Rules = rules, CreatedBy = createdBy, CreatedAt = now };
        challenge.AppendRound(1, firstRound);
        return challenge;
    }
}

/// <summary>Un morceau d'un défi, à sa position : sa manche. Il désigne le morceau par son identifiant (Catalogue).</summary>
public sealed class RunChallengeTrack
{
    private RunChallengeTrack()
    {
    }

    internal RunChallengeTrack(short position, int trackId, short round)
    {
        Position = position;
        TrackId = trackId;
        Round = round;
    }

    public int ChallengeId { get; private set; }

    public short Position { get; private set; }

    public int TrackId { get; private set; }

    /// <summary>La manche, à partir de 1.</summary>
    public short Round { get; private set; }
}

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Le défi d'un run : les morceaux tirés une fois pour toutes (4 manches de 5 au proto 1), les règles figées au moment du tirage, le code qui sert de
/// lien. Il ne dépend d'aucun joueur et ne change plus une fois créé. Sa graine est tirée au hasard et n'est jamais exposée.
/// </summary>
public sealed class RunChallenge
{
    private readonly List<RunChallengeTrack> _tracks = [];

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

    /// <param name="tracks">Les morceaux dans l'ordre du jeu, avec leur manche et leur multiplicateur.</param>
    public static RunChallenge Create(string code, int seed, RunRules rules, IReadOnlyList<PlannedTrack> tracks, Guid? createdBy, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(rules);
        if (RunChallengeCode.Normalize(code) != code)
            throw new ArgumentException("Code de défi invalide.", nameof(code));
        if (tracks.Count != rules.TrackCount)
            throw new ArgumentException("Un défi a exactement les morceaux que ses règles demandent.", nameof(tracks));
        if (tracks.Select(t => t.TrackId).Distinct().Count() != tracks.Count)
            throw new ArgumentException("Un morceau ne figure qu'une fois dans un défi.", nameof(tracks));

        var challenge = new RunChallenge { Code = code, Seed = seed, Rules = rules, CreatedBy = createdBy, CreatedAt = now };
        for (var i = 0; i < tracks.Count; i++)
            challenge._tracks.Add(new RunChallengeTrack((short)(i + 1), tracks[i].TrackId, (short)tracks[i].Round, tracks[i].Multiplier));
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

/// <summary>Un morceau tiré, avant que le défi n'existe.</summary>
public sealed record PlannedTrack(int TrackId, int Round, decimal Multiplier);

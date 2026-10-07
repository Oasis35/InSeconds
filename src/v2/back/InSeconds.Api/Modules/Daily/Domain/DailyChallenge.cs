namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Comment un défi a été généré (colonne <c>origin</c>, vide pour l'historique repris de la v1).</summary>
public enum ChallengeOrigin : short
{
    /// <summary>La tâche de minuit.</summary>
    Nightly = 1,

    /// <summary>Le secours : un joueur arrive alors que la tâche de minuit n'a rien généré.</summary>
    OnTheFly = 2,

    /// <summary>Le bouton « Générer le défi du jour » de l'admin.</summary>
    Admin = 3,
}

/// <summary>
/// Le défi d'un jour (§ 4.4 du plan v2) : les mêmes morceaux, dans le même ordre, pour tous les joueurs. Un jour,
/// un seul défi (index unique sur la date). La graine du tirage est le numéro du jour : le défi se retrouve à
/// l'identique si on le regénère à partir du même pool.
/// </summary>
public sealed class DailyChallenge
{
    private readonly List<ChallengeTrack> _tracks = [];

    private DailyChallenge()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence), pour figurer dans le compte rendu avant l'enregistrement.</summary>
    public int Id { get; private set; }

    public DateOnly Date { get; private set; }

    public int Seed { get; private set; }

    /// <summary>Vide pour l'historique repris de la v1.</summary>
    public ChallengeOrigin? Origin { get; private set; }

    /// <summary>Les morceaux, par position (de 1 à N).</summary>
    public IReadOnlyList<ChallengeTrack> Tracks => _tracks;

    /// <summary>La graine d'un jour : son numéro. Même règle qu'en v1, pour que tout le monde joue le même défi.</summary>
    public static int SeedOf(DateOnly day) => day.DayNumber;

    public static DailyChallenge Create(DateOnly date, ChallengeOrigin origin, IReadOnlyList<int> trackIds)
    {
        if (trackIds.Count == 0)
            throw new ArgumentException("Un défi a au moins un morceau.", nameof(trackIds));
        if (trackIds.Distinct().Count() != trackIds.Count)
            throw new ArgumentException("Un morceau ne figure qu'une fois dans un défi.", nameof(trackIds));

        var challenge = new DailyChallenge { Date = date, Seed = SeedOf(date), Origin = origin };
        for (var i = 0; i < trackIds.Count; i++)
            challenge._tracks.Add(new ChallengeTrack((short)(i + 1), trackIds[i]));
        return challenge;
    }
}

/// <summary>Un morceau d'un défi, à sa position. Il désigne le morceau par son identifiant, sans le connaître (Catalogue).</summary>
public sealed class ChallengeTrack
{
    private ChallengeTrack()
    {
    }

    internal ChallengeTrack(short position, int trackId)
    {
        Position = position;
        TrackId = trackId;
    }

    public int ChallengeId { get; private set; }

    public short Position { get; private set; }

    public int TrackId { get; private set; }
}

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Où en est une partie (colonne <c>status</c>).</summary>
public enum RunSessionStatus : short
{
    /// <summary>En cours.</summary>
    Pending = 0,

    /// <summary>Les manches sont toutes passées.</summary>
    Won = 1,

    /// <summary>Une manche n'a pas atteint son objectif.</summary>
    Lost = 2,

    /// <summary>Abandonnée (bouton).</summary>
    Abandoned = 3,
}

/// <summary>
/// La partie d'un joueur sur un défi (une seule par joueur et par défi : index unique). Le socle ne porte que ce que les droits d'un joueur et la
/// base ont besoin de connaître ; le déroulement (verrou, jauge, fin) est celui de la partie, qui vient avec ses routes.
/// </summary>
public sealed class RunSession
{
    private readonly List<RunAnswer> _answers = [];

    private RunSession()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence).</summary>
    public int Id { get; private set; }

    public int ChallengeId { get; private set; }

    public Guid PlayerId { get; private set; }

    public RunSessionStatus Status { get; private set; }

    /// <summary>Le morceau en cours (le verrou), vide hors partie en cours.</summary>
    public short? CurrentPosition { get; private set; }

    /// <summary>Le plus long palier écouté sur le morceau en cours.</summary>
    public decimal? CurrentListenedSeconds { get; private set; }

    public short RoundsPassed { get; private set; }

    public int TotalScore { get; private set; }

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EndedAt { get; private set; }

    public IReadOnlyList<RunAnswer> Answers => _answers;

    public static RunSession Start(int challengeId, Guid playerId, DateTimeOffset now) =>
        new() { ChallengeId = challengeId, PlayerId = playerId, Status = RunSessionStatus.Pending, CurrentPosition = 1, StartedAt = now };
}

/// <summary>La réponse d'une partie sur un morceau. **Jamais le texte saisi** (RGPD) : seulement les verdicts et les points.</summary>
public sealed class RunAnswer
{
    private RunAnswer()
    {
    }

    public int SessionId { get; private set; }

    public short Position { get; private set; }

    public bool ArtistCorrect { get; private set; }

    public bool TitleCorrect { get; private set; }

    public int Points { get; private set; }

    /// <summary>Le morceau n'avait plus d'extrait : retiré du maximum de sa manche, par le serveur.</summary>
    public bool Neutralized { get; private set; }

    public DateTimeOffset AnsweredAt { get; private set; }

    public static RunAnswer Create(short position, bool artistCorrect, bool titleCorrect, int points, bool neutralized, DateTimeOffset now) =>
        new() { Position = position, ArtistCorrect = artistCorrect, TitleCorrect = titleCorrect, Points = points, Neutralized = neutralized, AnsweredAt = now };
}

/// <summary>Le record personnel d'un joueur (une ligne par joueur).</summary>
public sealed class RunRecord
{
    private RunRecord()
    {
    }

    public Guid PlayerId { get; private set; }

    public int BestScore { get; private set; }

    public short BestRoundsPassed { get; private set; }

    /// <summary>La partie qui l'a établi.</summary>
    public int SessionId { get; private set; }

    public DateTimeOffset AchievedAt { get; private set; }

    public static RunRecord Create(Guid playerId, int bestScore, short bestRoundsPassed, int sessionId, DateTimeOffset now) =>
        new() { PlayerId = playerId, BestScore = bestScore, BestRoundsPassed = bestRoundsPassed, SessionId = sessionId, AchievedAt = now };
}

/// <summary>L'interrupteur de l'admin : ce compte peut lancer un run (les admins le peuvent d'office, sans ligne).</summary>
public sealed class RunAccess
{
    private RunAccess()
    {
    }

    public Guid PlayerId { get; private set; }

    public DateTimeOffset GrantedAt { get; private set; }

    public static RunAccess Grant(Guid playerId, DateTimeOffset now) => new() { PlayerId = playerId, GrantedAt = now };
}

/// <summary>Écritures du module, nommées par l'intention.</summary>
public interface IRunsStore
{
    /// <summary>Ce code est déjà celui d'un défi (vérifié avant l'insertion, l'index unique restant le garde-fou).</summary>
    Task<bool> CodeExistsAsync(string code, CancellationToken ct);

    void AddChallenge(RunChallenge challenge);

    Task<RunAccess?> FindAccessAsync(Guid playerId, CancellationToken ct);

    void AddAccess(RunAccess access);

    void RemoveAccess(RunAccess access);
}

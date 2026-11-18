namespace InSeconds.Api.Modules.Social.Domain;

/// <summary>
/// Le nom sous lequel un compte apparaît au classement général quand il a choisi un **alias musical** (« Métronome fou 67 ») : une ligne tant qu'il
/// l'utilise, aucune sinon (le défaut : son pseudo). L'alias est unique sans tenir compte de la casse (index sur une colonne <c>citext</c>), et ne
/// vaut jamais le pseudo d'un compte. Désigne le joueur par son identifiant (Players).
/// </summary>
public sealed class RankingIdentity
{
    private RankingIdentity()
    {
    }

    public RankingIdentity(Guid playerId, string alias, DateTimeOffset chosenAt)
    {
        PlayerId = playerId;
        ChangeAlias(alias, chosenAt);
    }

    public Guid PlayerId { get; private set; }

    public string Alias { get; private set; } = "";

    /// <summary>Quand cet alias a été tiré.</summary>
    public DateTimeOffset ChosenAt { get; private set; }

    /// <summary>Un autre alias tiré (« Autre alias ») ; l'ancien redevient libre.</summary>
    public void ChangeAlias(string alias, DateTimeOffset chosenAt)
    {
        if (!MusicalAlias.IsWellFormed(alias))
            throw new ArgumentException("Ce n'est pas un alias musical.", nameof(alias));
        Alias = alias;
        ChosenAt = chosenAt;
    }
}

/// <summary>Les écritures du nom au classement général.</summary>
public interface IRankingIdentityStore
{
    /// <summary>L'alias de ce joueur, suivi ; rien s'il apparaît sous son pseudo.</summary>
    Task<RankingIdentity?> FindAsync(Guid playerId, CancellationToken ct);

    /// <summary>Cet alias est-il déjà celui d'un joueur (sans la casse) ?</summary>
    Task<bool> IsAliasTakenAsync(string alias, CancellationToken ct);

    /// <summary>
    /// Le verrou des tirages d'alias (un verrou consultatif de la transaction) : deux joueurs qui tirent au même moment se suivent, le second voit
    /// l'alias du premier. L'index unique reste le dernier filet.
    /// </summary>
    Task LockAliasDrawAsync(CancellationToken ct);

    void Add(RankingIdentity identity);

    void Remove(RankingIdentity identity);
}

/// <summary>Le classement général tel qu'un joueur le lit.</summary>
/// <param name="Top">Les premiers, dans l'ordre.</param>
/// <param name="Around">Le joueur et ses voisins, s'il est classé sans être dans <paramref name="Top"/> ; vide sinon.</param>
/// <param name="Total">Combien de joueurs sont classés.</param>
public sealed record GeneralRankingView(IReadOnlyList<RankingRow> Top, IReadOnlyList<RankingRow> Around, int Total);

/// <summary>
/// Le classement général : les comptes qui ont l'accès à un mode et y ont fini une partie, classés comme dans un groupe
/// (<see cref="GroupRankingPolicy"/>). Un joueur n'en voit que la tête, puis sa place avec ses deux voisins.
/// </summary>
public static class GeneralRankingPolicy
{
    public const int TopCount = 20;

    /// <param name="ranked">Le classement (sortie de <see cref="GroupRankingPolicy.Rank"/>).</param>
    public static GeneralRankingView Build(IReadOnlyList<RankingRow> ranked, Guid viewerId)
    {
        ArgumentNullException.ThrowIfNull(ranked);
        var rows = ranked.Where(r => r.Rank is not null).ToList();
        var top = rows.Take(TopCount).ToList();
        var index = rows.FindIndex(r => r.PlayerId == viewerId);
        IReadOnlyList<RankingRow> around = index < TopCount
            ? []
            : [.. rows.Skip(Math.Max(TopCount, index - 1)).Take(index + 2 - Math.Max(TopCount, index - 1))];
        return new GeneralRankingView(top, around, rows.Count);
    }
}

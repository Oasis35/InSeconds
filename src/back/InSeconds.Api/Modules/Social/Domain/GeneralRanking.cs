namespace InSeconds.Api.Modules.Social.Domain;

/// <summary>
/// Le choix d'un compte d'apparaître dans le classement général : une ligne tant qu'il y apparaît, aucune sinon (le défaut : personne n'y figure sans
/// l'avoir choisi). Désigne le joueur par son identifiant (Players).
/// </summary>
public sealed class RankingVisibility
{
    private RankingVisibility()
    {
    }

    public RankingVisibility(Guid playerId, DateTimeOffset visibleSince)
    {
        PlayerId = playerId;
        VisibleSince = visibleSince;
    }

    public Guid PlayerId { get; private set; }

    public DateTimeOffset VisibleSince { get; private set; }
}

/// <summary>Les écritures du choix de visibilité.</summary>
public interface IRankingVisibilityStore
{
    /// <summary>Le choix de ce joueur, suivi ; rien s'il n'apparaît pas.</summary>
    Task<RankingVisibility?> FindAsync(Guid playerId, CancellationToken ct);

    void Add(RankingVisibility visibility);

    void Remove(RankingVisibility visibility);
}

/// <summary>Le classement général tel qu'un joueur le lit.</summary>
/// <param name="Top">Les premiers, dans l'ordre.</param>
/// <param name="Around">Le joueur et ses voisins, s'il apparaît au classement sans être dans <paramref name="Top"/> ; vide sinon.</param>
/// <param name="Total">Combien de joueurs sont classés (ceux qui ont choisi d'apparaître et ont fini une partie).</param>
/// <param name="TopPercent">Où se situe le joueur, par dizaines (« top 30 % ») ; vide tant qu'il n'a fini aucune partie.</param>
public sealed record GeneralRankingView(IReadOnlyList<RankingRow> Top, IReadOnlyList<RankingRow> Around, int Total, int? TopPercent);

/// <summary>
/// Le classement général : les joueurs qui ont choisi d'y apparaître, classés comme dans un groupe (<see cref="GroupRankingPolicy"/>), sans ceux qui
/// n'ont fini aucune partie. Un joueur n'en voit que la tête, puis sa place avec ses deux voisins. Celui qui n'y apparaît pas ne reçoit qu'une position
/// anonyme, par dizaines : la part des classés qui font au moins aussi bien que lui, lui compris.
/// </summary>
public static class GeneralRankingPolicy
{
    public const int TopCount = 20;

    /// <param name="visible">Le classement des joueurs visibles (sortie de <see cref="GroupRankingPolicy.Rank"/>).</param>
    /// <param name="viewer">La ligne du joueur qui lit, classé seul, quand il n'apparaît pas au classement ; vide s'il y apparaît.</param>
    public static GeneralRankingView Build(IReadOnlyList<RankingRow> visible, Guid viewerId, RankingRow? viewer)
    {
        ArgumentNullException.ThrowIfNull(visible);
        var ranked = visible.Where(r => r.Rank is not null).ToList();
        var top = ranked.Take(TopCount).ToList();
        var index = ranked.FindIndex(r => r.PlayerId == viewerId);
        if (index >= 0)
        {
            IReadOnlyList<RankingRow> around = index < TopCount
                ? []
                : [.. ranked.Skip(Math.Max(TopCount, index - 1)).Take(index + 2 - Math.Max(TopCount, index - 1))];
            return new GeneralRankingView(top, around, ranked.Count, PercentOf(ranked[index].Rank!.Value, ranked.Count));
        }

        if (viewer?.Performance is not { } performance)
            return new GeneralRankingView(top, [], ranked.Count, null);
        // Il n'est pas dans la liste : sa place est celle qu'il y aurait, derrière ceux qui font strictement mieux.
        var position = 1 + ranked.Count(r => r.Performance > performance);
        return new GeneralRankingView(top, [], ranked.Count, PercentOf(position, ranked.Count + 1));
    }

    /// <summary>La dizaine supérieure de la place rapportée au nombre de classés : 3e sur 40 donne « top 10 % », 12e sur 40 « top 30 % ».</summary>
    private static int PercentOf(int position, int total) => Math.Clamp((int)Math.Ceiling(position * 10d / total) * 10, 10, 100);
}

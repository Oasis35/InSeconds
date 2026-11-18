using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Ce que le joueur qui tire une manche a entendu récemment, pour la diversité du tirage (<see cref="RunDiversity"/>) : les morceaux à éviter (jusqu'à une
/// part du pool jouable) et les thèmes joués, du plus récent au plus ancien, ceux de la playlist en cours d'abord.
/// </summary>
public sealed record RunDrawMemory(IReadOnlyList<int> AvoidTracks, IReadOnlyList<int> PlayedThemes)
{
    public static RunDrawMemory None { get; } = new([], []);
}

/// <summary>Construit <see cref="RunDrawMemory"/> : une seule règle pour la première manche (<see cref="RunChallengePlanner"/>) et les suivantes (<see cref="RunRoundDealer"/>).</summary>
public sealed class RunDrawMemoryReader(IRunsQueries queries, RunsRules rules)
{
    /// <param name="playerId">Le joueur qui tire ; vide : aucune mémoire de parties (seulement les thèmes de la playlist).</param>
    /// <param name="challengeId">La playlist en cours (ses morceaux ne comptent pas : ils sont déjà exclus du tirage) ; vide pour une playlist neuve.</param>
    /// <param name="themesInPlaylist">Les thèmes déjà joués dans cette playlist, du plus récent au plus ancien.</param>
    /// <param name="playableCount">La taille du pool jouable, dont la part à éviter se déduit.</param>
    public async Task<RunDrawMemory> ReadAsync(Guid? playerId, int? challengeId, IReadOnlyList<int> themesInPlaylist, int playableCount, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(themesInPlaylist);
        if (playerId is not { } player)
            return new RunDrawMemory([], themesInPlaylist);
        var options = rules.Diversity;
        var history = await queries.GetHeardHistoryAsync(player, challengeId, options.MaxGames, ct);
        return new RunDrawMemory(
            RunDiversity.TracksToAvoid(history.TrackIds, playableCount, options.PoolPercent),
            [.. themesInPlaylist, .. history.ThemeIds.Where(id => !themesInPlaylist.Contains(id))]);
    }
}

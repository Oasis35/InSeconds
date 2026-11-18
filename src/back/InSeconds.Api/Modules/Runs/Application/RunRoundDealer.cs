using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Un thème de l'offre : identifiant, nom, icône (Lucide, vide si aucune).</summary>
public sealed record RunThemeOption(int Id, string Name, string? Icon);

/// <summary>Ce que le premier joueur arrivé à une manche voit avant elle : deux thèmes, et le thème mystère (un autre thème, tiré au choix, qu'aucun des deux).</summary>
public sealed record RunThemeOffer(int Round, IReadOnlyList<RunThemeOption> Themes);

/// <summary>
/// Tire les manches de la Série à la volée. La première est tirée à la création du défi (<see cref="RunChallengePlanner"/>) ; chacune des suivantes
/// l'est quand **le premier joueur** y arrive, avec le thème qu'il a choisi (deux thèmes tirés au hasard, ou le thème mystère), puis ne change plus :
/// tous les joueurs de la playlist jouent les mêmes morceaux. Tout vient de la graine du défi : recharger l'écran redonne les mêmes thèmes, et un ami
/// qui arrive le premier sans qu'on lui propose de choix (moins de trois thèmes assez fournis) tire la manche sans thème.
/// <para>
/// **Diversité** (<see cref="RunDiversity"/>) : le joueur qui tire (<c>playerId</c>) ne retombe pas trop vite sur ce qu'il a déjà entendu. Les morceaux et
/// les thèmes de ses parties récentes passent après les autres, dans les limites des réglages <c>Runs:Diversity:</c>, et un thème déjà joué dans cette
/// playlist est évité aussi ; c'est toujours une préférence (le tirage relâche, du plus ancien au plus récent, plutôt que de bloquer une partie).
/// </para>
/// </summary>
public sealed class RunRoundDealer(
    ITrackDirectory tracks, ISeededShuffle shuffle, IRunTrackSelector selector, IRunsStore store, IRunsQueries queries, RunsRules rules)
{
    /// <summary>
    /// L'offre pour la manche <paramref name="round"/> ; vide si la manche est déjà tirée, si c'est la première, ou si moins de trois thèmes ont assez de
    /// morceaux libres au moment du choix.
    /// </summary>
    public async Task<RunThemeOffer?> OfferAsync(RunChallenge challenge, int round, Guid? playerId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (round < 2 || challenge.HasRound(round))
            return null;
        var pool = await PoolAsync(challenge, await MemoryAsync(challenge, playerId, ct), ct);
        return await OfferFromAsync(challenge, round, pool, ct);
    }

    private async Task<RunThemeOffer?> OfferFromAsync(RunChallenge challenge, int round, ThemePool pool, CancellationToken ct)
    {
        if (pool.Offerable.Count < RunThemes.MinEligibleThemes)
            return null;
        var two = shuffle.Shuffle(pool.Offerable, unchecked(challenge.Seed + (round * 31))).Take(2).ToList();
        var icons = await tracks.ListThemeIconsAsync(ct);
        return new RunThemeOffer(round, [.. two.Select(id => new RunThemeOption(id, pool.Names[id], icons.GetValueOrDefault(id)))]);
    }

    /// <summary>
    /// Tire la manche <paramref name="round"/> : avec le thème choisi (<paramref name="themeId"/>), le thème mystère quand il est vide et qu'une offre existe,
    /// sans thème quand il n'y a pas d'offre. Une manche déjà tirée (un autre joueur est arrivé en premier) n'est jamais retirée.
    /// </summary>
    /// <returns>Le thème de la manche, vide si elle est sans thème.</returns>
    /// <exception cref="ArgumentException">Ce thème n'est pas proposé.</exception>
    public async Task<RunRoundTheme?> DealAsync(RunChallenge challenge, int round, int? themeId, Guid? playerId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        // Le défi est partagé par tous ses joueurs : un autre a pu tirer cette manche pendant l'attente du verrou, alors rien n'est réécrit.
        await store.LockChallengeAsync(challenge, ct);
        if (challenge.HasRound(round))
            return challenge.Rules.ThemeOf(round);
        if (round != challenge.RoundsDrawn + 1)
            throw new InvalidOperationException("Les manches se tirent dans l'ordre.");

        var memory = await MemoryAsync(challenge, playerId, ct);
        var pool = await PoolAsync(challenge, memory, ct);
        var offer = round < 2 ? null : await OfferFromAsync(challenge, round, pool, ct);
        int? chosen = null;
        if (offer is not null)
        {
            if (themeId is { } asked && offer.Themes.All(t => t.Id != asked))
                throw new ArgumentException("Ce thème n'est pas proposé.", nameof(themeId));
            chosen = themeId ?? Mystery(challenge, offer, pool);
        }

        var used = challenge.Tracks.Select(t => t.TrackId).ToHashSet();
        var drawn = selector.SelectRound(pool.Candidates, challenge.Rules, challenge.Seed, round, used, chosen, memory.AvoidTracks);
        if (drawn.Count < challenge.Rules.TracksPerRound)
            throw new InvalidOperationException("Le catalogue n'a plus assez de morceaux pour tirer une manche.");
        var theme = chosen is { } id ? new RunRoundTheme(round, id, pool.Names[id], Mystery: themeId is null) : null;
        challenge.AppendRound(round, drawn, theme);
        return theme;
    }

    // Le thème mystère de l'offre : un thème assez fourni qui n'est aucun de ceux qu'elle propose, tiré avec la graine.
    private int? Mystery(RunChallenge challenge, RunThemeOffer offer, ThemePool pool)
    {
        var others = pool.Offerable.Where(id => offer.Themes.All(t => t.Id != id)).ToList();
        if (others.Count == 0)
            others = [.. pool.Eligible.Where(id => offer.Themes.All(t => t.Id != id))];
        return others.Count == 0 ? null : shuffle.Shuffle(others, unchecked(challenge.Seed + (offer.Round * 7919))).First();
    }

    // Ce que le joueur qui tire a entendu récemment : les morceaux à éviter (jusqu'à une part du pool) et les thèmes joués, du plus récent au plus ancien
    // (ceux de cette playlist d'abord). Rien sans joueur identifié, ni quand la diversité est coupée.
    private async Task<DrawMemory> MemoryAsync(RunChallenge challenge, Guid? playerId, CancellationToken ct)
    {
        var options = rules.Diversity;
        var inPlaylist = challenge.Rules.Themes?.OrderByDescending(t => t.Round).Select(t => t.ThemeId).ToList() ?? [];
        if (playerId is not { } player)
            return new DrawMemory([], inPlaylist);
        var history = await queries.GetHeardHistoryAsync(player, challenge.Id == 0 ? null : challenge.Id, options.MaxGames, ct);
        var playable = (await tracks.ListPlayableIdsAsync(ct)).Count;
        return new DrawMemory(
            RunDiversity.TracksToAvoid(history.TrackIds, playable, options.PoolPercent), [.. inPlaylist, .. history.ThemeIds.Where(id => !inPlaylist.Contains(id))]);
    }

    // Les morceaux jouables hors ceux déjà tirés (aucun morceau deux fois dans une playlist), et les thèmes qui en ont assez pour une manche : ceux qu'on
    // peut proposer (assez de morceaux pas entendus récemment, si au moins trois, et sans les thèmes joués récemment dans la limite des réglages).
    private async Task<ThemePool> PoolAsync(RunChallenge challenge, DrawMemory memory, CancellationToken ct)
    {
        var taken = challenge.Tracks.Select(t => t.TrackId).ToHashSet();
        var avoided = memory.AvoidTracks.ToHashSet();
        var playable = (await tracks.ListPlayableIdsAsync(ct)).ToList();
        var infos = playable.Count == 0 ? new Dictionary<int, TrackInfo>() : await tracks.GetAsync(playable, ct);
        var candidates = playable.Select(id => new RankedTrack(id, infos.GetValueOrDefault(id)?.DeezerRank, infos.GetValueOrDefault(id)?.ThemeIds)).ToList();
        var names = await tracks.ListThemesAsync(ct);
        var perRound = challenge.Rules.TracksPerRound;
        var free = candidates.Where(c => !taken.Contains(c.Id));
        var eligible = RunThemes.Eligible(free.Select(c => c.ThemeIds), perRound).Where(names.ContainsKey).ToList();
        var fresh = RunThemes.Eligible(free.Where(c => !avoided.Contains(c.Id)).Select(c => c.ThemeIds), perRound).Where(names.ContainsKey).ToList();
        var basis = fresh.Count >= RunThemes.MinEligibleThemes ? fresh : eligible;
        var skipped = RunDiversity.ThemesToAvoid(memory.PlayedThemes, basis, rules.Diversity.ThemePercent).ToHashSet();
        return new ThemePool(candidates, names, eligible, [.. basis.Where(id => !skipped.Contains(id))]);
    }

    private sealed record DrawMemory(IReadOnlyList<int> AvoidTracks, IReadOnlyList<int> PlayedThemes);

    private sealed record ThemePool(
        IReadOnlyList<RankedTrack> Candidates, IReadOnlyDictionary<int, string> Names, IReadOnlyList<int> Eligible, IReadOnlyList<int> Offerable);
}

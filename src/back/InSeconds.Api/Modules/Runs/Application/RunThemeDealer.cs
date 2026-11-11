using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Un thème de l'offre : identifiant, nom, icône (Lucide, vide si aucune).</summary>
public sealed record RunThemeOption(int Id, string Name, string? Icon);

/// <summary>Ce que le créateur voit avant la manche à thème : deux thèmes, et le thème mystère (un autre thème, tiré à l'appui, qu'aucun des deux).</summary>
public sealed record RunThemeOffer(int Round, IReadOnlyList<RunThemeOption> Themes);

/// <summary>
/// Le thème de la manche en attente (<see cref="RunRules.PendingThemeRound"/>) : l'offre faite au créateur juste avant la manche, puis le tirage des
/// morceaux de la manche dans le thème choisi. Tout vient de la graine de la playlist : recharger l'écran redonne les mêmes thèmes, et un ami qui
/// arrive le premier à cette manche tire le même thème mystère que le créateur l'aurait tiré. Les morceaux des autres manches ne bougent jamais.
/// </summary>
public sealed class RunThemeDealer(ITrackDirectory tracks, ISeededShuffle shuffle, IRunsStore store)
{
    /// <summary>
    /// L'offre pour la manche en attente ; vide si aucune manche n'attend de thème, ou si moins de trois thèmes ont assez de morceaux (hors ceux des
    /// autres manches) au moment du choix.
    /// </summary>
    public async Task<RunThemeOffer?> OfferAsync(RunChallenge challenge, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Rules.PendingThemeRound is not { } round)
            return null;
        var pool = await PoolAsync(challenge, round, ct);
        var eligible = pool.Eligible;
        if (eligible.Count < RunThemes.MinEligibleThemes)
            return null;
        var two = shuffle.Shuffle(eligible, unchecked(challenge.Seed + round * 31)).Take(2).ToList();
        var icons = await tracks.ListThemeIconsAsync(ct);
        return new RunThemeOffer(round, [.. two.Select(id => new RunThemeOption(id, pool.Names[id], icons.GetValueOrDefault(id)))]);
    }

    /// <summary>
    /// Le thème mystère de cette offre : un thème assez fourni qui n'est aucun de ceux qu'elle propose, tiré avec la graine.
    /// </summary>
    public async Task<int?> MysteryAsync(RunChallenge challenge, RunThemeOffer offer, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(offer);
        var pool = await PoolAsync(challenge, offer.Round, ct);
        var others = pool.Eligible.Where(id => offer.Themes.All(t => t.Id != id)).ToList();
        return others.Count == 0 ? null : shuffle.Shuffle(others, unchecked(challenge.Seed + offer.Round * 7919)).First();
    }

    /// <summary>
    /// Applique le thème : ses morceaux et sa réserve prennent la place de ceux de la manche. <paramref name="themeId"/> vide : le thème mystère.
    /// Sans offre (moins de trois thèmes fournis), la manche se joue sans thème.
    /// </summary>
    /// <returns>Le thème pris, vide si la manche reste sans thème.</returns>
    public async Task<RunRoundTheme?> ApplyAsync(RunChallenge challenge, int? themeId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        // Le défi est partagé par tous ses joueurs : un autre a pu choisir le thème pendant l'attente du verrou, alors rien n'est réécrit.
        await store.LockChallengeAsync(challenge, ct);
        if (challenge.Rules.PendingThemeRound is null)
            return challenge.Rules.Themes?.LastOrDefault();
        if (await OfferAsync(challenge, ct) is not { } offer)
        {
            challenge.DropPendingTheme();
            return null;
        }

        var id = themeId ?? await MysteryAsync(challenge, offer, ct);
        var pool = await PoolAsync(challenge, offer.Round, ct);
        if (id is not { } chosen || !pool.Eligible.Contains(chosen))
            throw new ArgumentException("Ce thème n'est pas proposé.", nameof(themeId));
        var needed = challenge.Tracks.Count(t => t.Round == offer.Round) + challenge.Reserve.Count(r => r.Round == offer.Round);
        var ranked = pool.Candidates.Where(c => c.ThemeIds?.Contains(chosen) == true)
            .OrderByDescending(c => c.DeezerRank ?? int.MinValue).ThenBy(c => c.Id).Select(c => c.Id).ToList();
        var drawn = shuffle.Shuffle(ranked, unchecked(challenge.Seed + offer.Round)).Take(needed).ToList();
        var play = challenge.Tracks.Count(t => t.Round == offer.Round);
        var theme = new RunRoundTheme(offer.Round, chosen, pool.Names[chosen]);
        challenge.ApplyTheme(theme, drawn.Take(play).ToList(), drawn.Skip(play).ToList());
        return theme;
    }

    // Les morceaux jouables, sans ceux des autres manches (aucun morceau deux fois dans une playlist), et les thèmes qui en ont assez pour la manche.
    private async Task<ThemePool> PoolAsync(RunChallenge challenge, int round, CancellationToken ct)
    {
        var taken = challenge.Tracks.Where(t => t.Round != round).Select(t => t.TrackId)
            .Concat(challenge.Reserve.Where(r => r.Round != round).Select(r => r.TrackId)).ToHashSet();
        var playable = (await tracks.ListPlayableIdsAsync(ct)).Where(id => !taken.Contains(id)).ToList();
        var infos = playable.Count == 0 ? new Dictionary<int, TrackInfo>() : await tracks.GetAsync(playable, ct);
        var candidates = playable.Select(id => new RankedTrack(id, infos.GetValueOrDefault(id)?.DeezerRank, infos.GetValueOrDefault(id)?.ThemeIds)).ToList();
        var names = await tracks.ListThemesAsync(ct);
        var needed = challenge.Tracks.Count(t => t.Round == round) + challenge.Reserve.Count(r => r.Round == round);
        var eligible = candidates.SelectMany(c => c.ThemeIds ?? []).GroupBy(id => id).Where(g => g.Count() >= needed && names.ContainsKey(g.Key))
            .Select(g => g.Key).Order().ToList();
        return new ThemePool(candidates, names, eligible);
    }

    private sealed record ThemePool(IReadOnlyList<RankedTrack> Candidates, IReadOnlyDictionary<int, string> Names, IReadOnlyList<int> Eligible);
}

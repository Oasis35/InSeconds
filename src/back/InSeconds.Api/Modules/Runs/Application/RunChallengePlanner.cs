using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Ce qu'un tirage de défi a donné.</summary>
/// <param name="Challenge">Le défi à enregistrer ; vide si le pool est insuffisant.</param>
public sealed record PlanResult(RunChallenge? Challenge, int EligibleCount, int Requested);

/// <summary>
/// Crée le défi d'une Série : règles figées depuis les réglages du moment, graine et code tirés au hasard (jamais exposée, la graine), **première
/// manche** tirée parmi tout le catalogue jouable (Daily compris), les plus connus d'abord ; les suivantes le sont quand un joueur y arrive
/// (<see cref="RunRoundDealer"/>). La route qui lance une Série l'appelle ; le défi n'est pas enregistré ici. Le code est vérifié avant l'insertion
/// (pas de réessai dans la transaction Wolverine) : 31⁶ codes, une collision est très rare, et l'index unique reste le garde-fou.
/// </summary>
public sealed class RunChallengePlanner(
    ITrackDirectory tracks, IRunTrackSelector selector, IRunsStore store, RunDrawMemoryReader memories, RunsRules rules, TimeProvider time)
{
    /// <summary>Combien de codes essayer avant de renoncer (une collision répétée n'est plus de la malchance).</summary>
    private const int MaxCodeAttempts = 5;

    public async Task<PlanResult> PlanAsync(Guid? createdBy, CancellationToken ct)
    {
        var current = rules.Current();
        var playable = await tracks.ListPlayableIdsAsync(ct);
        var infos = playable.Count == 0 ? new Dictionary<int, TrackInfo>() : await tracks.GetAsync(playable, ct);
        var candidates = playable.Select(id => new RankedTrack(id, infos.GetValueOrDefault(id)?.DeezerRank, infos.GetValueOrDefault(id)?.ThemeIds)).ToList();

        var seed = System.Security.Cryptography.RandomNumberGenerator.GetInt32(int.MaxValue);
        // Diversité : la première manche évite elle aussi ce que le créateur a entendu récemment (une préférence, jamais un blocage).
        var memory = await memories.ReadAsync(createdBy, challengeId: null, [], playable.Count, ct);
        var first = selector.SelectRound(candidates, current, seed, round: 1, used: new HashSet<int>(), themeId: null, memory.AvoidTracks);
        if (first.Count < current.TracksPerRound)
            return new PlanResult(null, playable.Count, current.TracksPerRound);

        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var code = RunChallengeCode.Generate();
            if (await store.CodeExistsAsync(code, ct))
                continue;
            return new PlanResult(RunChallenge.Create(code, seed, current, first, createdBy, time.GetUtcNow()), playable.Count, current.TracksPerRound);
        }

        throw new InvalidOperationException("Impossible de trouver un code de défi libre.");
    }
}

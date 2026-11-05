using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Tire les deux leurres de « Trois choix » quand la carte est jouée (<see cref="RunChoices"/> dit qui peut l'être) : des morceaux jouables du
/// catalogue, dans un ordre fixé par la graine de la playlist et la position. Ils sont ensuite figés avec la carte : une reprise les retrouve.
/// </summary>
public sealed class RunChoiceDealer(ITrackDirectory directory, ISeededShuffle shuffle)
{
    /// <summary>Les morceaux lus à la fois : la plupart de ceux tirés conviennent, on n'en lit que quelques-uns.</summary>
    private const int Batch = 8;

    public async Task<IReadOnlyList<int>> DecoysAsync(RunChallenge challenge, int position, TrackInfo answer, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        ArgumentNullException.ThrowIfNull(answer);
        var inPlaylist = challenge.AllTrackIds().ToHashSet();
        var candidates = (await directory.ListPlayableIdsAsync(ct)).Where(id => !inPlaylist.Contains(id)).Order().ToList();
        var chosen = new List<(int Id, string Artist)>();
        foreach (var batch in shuffle.Shuffle(candidates, unchecked((challenge.Seed * 31) + position)).Chunk(Batch))
        {
            var infos = await directory.GetAsync(batch, ct);
            foreach (var id in batch)
            {
                if (chosen.Count < RunChoices.DecoyCount && infos.TryGetValue(id, out var candidate)
                    && RunChoices.IsDecoy(answer.Artist, candidate.Artist, chosen.Select(c => c.Artist)))
                    chosen.Add((id, candidate.Artist));
            }

            if (chosen.Count == RunChoices.DecoyCount)
                break;
        }

        return chosen.Select(c => c.Id).ToList();
    }
}

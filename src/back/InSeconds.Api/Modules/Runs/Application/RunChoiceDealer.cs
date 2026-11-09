using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Tire les deux leurres du « QCM » (<see cref="RunChoices"/> dit qui peut l'être) : des morceaux jouables du catalogue, dans un ordre fixé par la
/// graine de la playlist et la position, de préférence **proches de la bonne réponse** (un genre en commun, ou une année à sept ans près), pour que
/// le choix ne soit pas trop facile. Playlist durable : tirés de nouveau à chaque envoi du morceau, du même ordre (les mêmes tant que le catalogue
/// ne change pas) ; playlist d'avant : figés avec la carte quand elle est jouée.
/// </summary>
public sealed class RunChoiceDealer(ITrackDirectory directory, ISeededShuffle shuffle)
{
    /// <summary>Les morceaux lus à la fois : la plupart de ceux tirés conviennent, on n'en lit que quelques-uns.</summary>
    private const int Batch = 8;

    /// <summary>Combien de lots lire au plus en cherchant des leurres proches (au-delà, on complète avec n'importe quel autre artiste).</summary>
    private const int MaxBatches = 12;

    /// <summary>L'écart d'années en deçà duquel deux morceaux sont « de la même époque ».</summary>
    private const int CloseYears = 7;

    public async Task<IReadOnlyList<int>> DecoysAsync(RunChallenge challenge, int position, TrackInfo answer, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        ArgumentNullException.ThrowIfNull(answer);
        var inPlaylist = challenge.AllTrackIds().ToHashSet();
        var candidates = (await directory.ListPlayableIdsAsync(ct)).Where(id => !inPlaylist.Contains(id)).Order().ToList();
        var close = new List<(int Id, string Artist)>();
        var others = new List<(int Id, string Artist)>();
        foreach (var batch in shuffle.Shuffle(candidates, unchecked((challenge.Seed * 31) + position)).Chunk(Batch).Take(MaxBatches))
        {
            var infos = await directory.GetAsync(batch, ct);
            foreach (var id in batch)
            {
                if (close.Count >= RunChoices.DecoyCount || !infos.TryGetValue(id, out var candidate)
                    || !RunChoices.IsDecoy(answer.Artist, candidate.Artist, close.Concat(others).Select(c => c.Artist)))
                    continue;
                (IsClose(answer, candidate) ? close : others).Add((id, candidate.Artist));
            }

            if (close.Count >= RunChoices.DecoyCount)
                break;
        }

        return close.Concat(others).Take(RunChoices.DecoyCount).Select(c => c.Id).ToList();
    }

    // Un genre en commun, ou des années proches quand les deux sont connues.
    private static bool IsClose(TrackInfo answer, TrackInfo candidate) =>
        answer.Genres.Intersect(candidate.Genres, StringComparer.OrdinalIgnoreCase).Any()
        || (answer.ReleaseYear is { } year && candidate.ReleaseYear is { } other && Math.Abs(year - other) <= CloseYears);
}

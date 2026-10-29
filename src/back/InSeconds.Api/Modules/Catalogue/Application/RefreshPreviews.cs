using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.Attributes;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Recontrôle l'extrait (et met à jour le rang) de **tout le pool jouable**, cooldown compris : un mode peut tirer n'importe quel morceau
/// (un run), pas seulement ceux que le défi de demain tirerait. Lancé par la tâche <c>catalogue-refresh</c> chaque nuit, ou à la main depuis
/// <c>/jobs</c>.
/// </summary>
public sealed record RefreshPreviews;

/// <summary>Compte rendu de l'exécution, conservé par Hangfire et lu par <c>GET /api/admin/jobs/last-runs</c>.</summary>
/// <param name="Checked">Morceaux contrôlés.</param>
/// <param name="Updated">Morceaux dont l'état de l'extrait a changé.</param>
/// <param name="Failed">Morceaux dont Deezer n'a pas répondu (quota, panne) : leur état est inchangé.</param>
public sealed record PreviewRefreshResult(int Checked, int Updated, int Failed)
{
    /// <summary>
    /// Le compte rendu tel que la tâche le renvoie à Hangfire : un dictionnaire plutôt que le record lui-même, car
    /// Hangfire n'écrit pas les propriétés à zéro ("failed" serait absent d'une exécution sans échec). Les clés sont
    /// stables : l'onglet Actions de l'admin les lit.
    /// </summary>
    public Dictionary<string, int> ToReport() => new() { ["checked"] = Checked, ["updated"] = Updated, ["failed"] = Failed };
}

public static class RefreshPreviewsHandler
{
    // Pas de transaction Wolverine : le contrôle dure plusieurs minutes (lots espacés), une transaction ouverte pendant
    // les pauses retiendrait une connexion pour rien, et un seul enregistrement final perdrait tout si un morceau était
    // supprimé entre-temps. Chaque lot est enregistré tout de suite par le store (SaveRefreshedAsync).
    [NonTransactional]
    public static async Task<PreviewRefreshResult> Handle(
        RefreshPreviews command,
        ICatalogueStore store,
        ITrackMetadataSource deezer,
        IAlbumSource albums,
        TimeProvider time,
        IOptionsMonitor<RefreshOptions> options,
        ILogger<RefreshPreviews> logger,
        CancellationToken ct)
    {
        // Tout le pool, sauf les morceaux désactivés (jamais tirés par personne) : le cooldown n'exclut plus rien, car il n'est qu'une règle du
        // Daily. Un run tire n'importe quel morceau ; le rang et l'extrait doivent être à jour partout.
        var candidates = await store.ListRefreshCandidatesAsync(ct);
        if (candidates.Count == 0)
        {
            CatalogueLog.NothingToRefresh(logger);
            return new PreviewRefreshResult(0, 0, 0);
        }

        // Relu à chaque contrôle (réglage en base, relu à chaud), une seule fois : la cadence ne change pas en cours de route.
        var settings = options.CurrentValue;
        var batchSize = Math.Max(1, settings.BatchSize);
        var updated = 0;
        var failed = 0;

        for (var offset = 0; offset < candidates.Count; offset += batchSize)
        {
            if (offset > 0)
                await Task.Delay(settings.BatchDelay, time, ct);

            var batch = candidates.Skip(offset).Take(batchSize).ToList();
            var lookups = await Task.WhenAll(batch.Select(t => deezer.GetTrackAsync(t.DeezerTrackId, ct)));
            var touched = new List<Track>();
            var changed = new HashSet<int>();

            for (var i = 0; i < batch.Count; i++)
            {
                var now = time.GetUtcNow();
                switch (lookups[i])
                {
                    // Deezer n'a pas répondu (quota, panne, service occupé) : l'état du morceau est inconnu,
                    // on n'y touche pas (piège 16).
                    case TrackMetadataLookup.Unavailable:
                        failed++;
                        break;
                    // Morceau supprimé chez Deezer : plus d'extrait.
                    case TrackMetadataLookup.NotFound:
                        if (batch[i].RecordPreviewCheck(PreviewCheck.Missing, now))
                            changed.Add(batch[i].Id);
                        touched.Add(batch[i]);
                        break;
                    case TrackMetadataLookup.Found found:
                        if (batch[i].RecordPreviewCheck(string.IsNullOrEmpty(found.Track.PreviewUrl) ? PreviewCheck.Missing : PreviewCheck.Available, now))
                            changed.Add(batch[i].Id);
                        if (found.Track.Rank is { } rank)
                            batch[i].RecordRank(rank, now);
                        // L'album vient dans la même réponse : aucun appel de plus. Les genres se lisent ensuite, album par album.
                        batch[i].RecordAlbum(found.Track.AlbumId);
                        touched.Add(batch[i]);
                        break;
                }
            }

            // Un morceau supprimé pendant le contrôle n'est pas enregistré, et n'est pas compté comme mis à jour.
            var saved = await store.SaveRefreshedAsync(touched, ct);
            updated += changed.Count(saved.Contains);
        }

        CatalogueLog.RefreshCompleted(logger, candidates.Count, updated, failed);
        await RefreshGenresAsync(candidates, store, albums, time, settings, logger, ct);
        return new PreviewRefreshResult(candidates.Count, updated, failed);
    }

    /// <summary>
    /// Rattrape les genres : **un appel par album** (pas par morceau) pour les albums dont les genres n'ont jamais été lus, lots espacés comme
    /// ceux des morceaux (quota Deezer, piège 16). Une réponse indisponible ne change rien (l'album sera repris au prochain contrôle) ;
    /// un album supprimé chez Deezer (800) n'a pas de genre et n'est plus redemandé. Les genres de l'album vont à tous ses morceaux du pool.
    /// </summary>
    private static async Task RefreshGenresAsync(
        IReadOnlyList<Track> candidates, ICatalogueStore store, IAlbumSource albums, TimeProvider time, RefreshOptions settings,
        ILogger logger, CancellationToken ct)
    {
        var pending = candidates
            .Where(t => t.AlbumId is not null && t.GenresCheckedAt is null)
            .Select(t => t.AlbumId!.Value)
            .Distinct()
            .ToList();
        if (pending.Count == 0)
            return;

        var batchSize = Math.Max(1, settings.BatchSize);
        var failed = 0;
        for (var offset = 0; offset < pending.Count; offset += batchSize)
        {
            // Le contrôle des morceaux vient de finir : la première série d'albums attend aussi, la cadence reste celle du réglage.
            await Task.Delay(settings.BatchDelay, time, ct);

            var batch = pending.Skip(offset).Take(batchSize).ToList();
            var lookups = await Task.WhenAll(batch.Select(id => albums.GetAlbumAsync(id, ct)));
            for (var i = 0; i < batch.Count; i++)
            {
                switch (lookups[i])
                {
                    case AlbumLookup.Found found:
                        await store.SaveAlbumGenresAsync(batch[i], [.. found.Genres.Select(g => new GenreRef(g.Id, g.Name))], time.GetUtcNow(), ct);
                        break;
                    case AlbumLookup.NotFound:
                        await store.SaveAlbumGenresAsync(batch[i], [], time.GetUtcNow(), ct);
                        break;
                    default:
                        failed++;
                        break;
                }
            }
        }

        CatalogueLog.GenresRefreshed(logger, pending.Count, failed);
    }
}

/// <summary>Tâche <c>catalogue-refresh</c>, chaque soir à 23 h UTC, la veille de la génération du défi.</summary>
public sealed class RefreshPreviewsJob(IMessageBus bus) : IScheduledJob
{
    public const string Id = "catalogue-refresh";
    public const string DefaultCron = "0 23 * * *";

    // Le contrôle dure plusieurs minutes pour un grand pool (lots espacés) : jamais deux à la fois. Le délai d'attente du
    // verrou dépasse la durée d'un contrôle : la tâche de 23 h lancée pendant un contrôle manuel (depuis /jobs) attend
    // qu'il finisse au lieu d'échouer puis de repartir dix minutes plus tard.
    [DisableConcurrentExecution(timeoutInSeconds: 600)]
    [AutomaticRetry(Attempts = 2, DelaysInSeconds = [600])]
    public async Task<object?> RunAsync(CancellationToken cancellationToken) =>
        (await bus.InvokeAsync<PreviewRefreshResult>(new RefreshPreviews(), cancellationToken)).ToReport();
}

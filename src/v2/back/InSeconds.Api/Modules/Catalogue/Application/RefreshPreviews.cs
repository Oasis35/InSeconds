using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Recontrôle l'extrait (et met à jour le rang) des morceaux que le défi de demain pourrait tirer. Lancé par la
/// tâche <c>catalogue-refresh</c> chaque nuit, et par le bouton « Re-vérifier les previews » de l'admin :
/// la logique n'est écrite qu'ici (§ 5.4 bis du plan v2).
/// </summary>
public sealed record RefreshPreviews;

/// <summary>Compte rendu de l'exécution, conservé par Hangfire et lu par <c>GET /api/admin/jobs/{id}</c>.</summary>
/// <param name="Checked">Morceaux contrôlés.</param>
/// <param name="Updated">Morceaux dont l'état de l'extrait a changé.</param>
/// <param name="Failed">Morceaux dont Deezer n'a pas répondu (quota, panne) : leur état est inchangé.</param>
public sealed record PreviewRefreshResult(int Checked, int Updated, int Failed)
{
    /// <summary>
    /// Le compte rendu tel que la tâche le renvoie à Hangfire : un dictionnaire plutôt que le record lui-même, car
    /// Hangfire n'écrit pas les propriétés à zéro ("failed" serait absent d'une exécution sans échec). Les clés sont
    /// celles du plan (§ 5.4 bis).
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
        ITrackUsage usage,
        ITrackMetadataSource deezer,
        IGameCalendar calendar,
        TimeProvider time,
        IOptions<RefreshOptions> options,
        ILogger<RefreshPreviews> logger,
        CancellationToken ct)
    {
        // Mêmes morceaux que le tirage de demain (la tâche tourne à 23 h, la veille de la génération) : un morceau
        // utilisé redevient tirable une fois son cooldown écoulé, son extrait doit être revérifié avant. Ceux
        // encore en cooldown, ou désactivés, ne seront pas tirés : inutile de les vérifier.
        var inCooldown = await usage.GetTracksInCooldownAsync(calendar.Today.AddDays(1), ct);
        var candidates = await store.ListRefreshCandidatesAsync([.. inCooldown], ct);
        if (candidates.Count == 0)
        {
            CatalogueLog.NothingToRefresh(logger);
            return new PreviewRefreshResult(0, 0, 0);
        }

        var batchSize = Math.Max(1, options.Value.BatchSize);
        var updated = 0;
        var failed = 0;

        for (var offset = 0; offset < candidates.Count; offset += batchSize)
        {
            if (offset > 0)
                await Task.Delay(options.Value.BatchDelay, time, ct);

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
                        touched.Add(batch[i]);
                        break;
                }
            }

            // Un morceau supprimé pendant le contrôle n'est pas enregistré, et n'est pas compté comme mis à jour.
            var saved = await store.SaveRefreshedAsync(touched, ct);
            updated += changed.Count(saved.Contains);
        }

        CatalogueLog.RefreshCompleted(logger, candidates.Count, updated, failed);
        return new PreviewRefreshResult(candidates.Count, updated, failed);
    }
}

/// <summary>Tâche <c>catalogue-refresh</c> (§ 5.4 bis du plan v2), chaque soir à 23 h UTC, la veille de la génération du défi.</summary>
public sealed class RefreshPreviewsJob(IMessageBus bus) : IScheduledJob
{
    public const string Id = "catalogue-refresh";
    public const string DefaultCron = "0 23 * * *";

    // Le contrôle dure plusieurs minutes pour un grand pool (lots espacés) : jamais deux à la fois. Le délai d'attente du
    // verrou dépasse la durée d'un contrôle : la tâche de 23 h lancée pendant un contrôle manuel attend qu'il finisse au
    // lieu d'échouer puis de repartir dix minutes plus tard.
    [DisableConcurrentExecution(timeoutInSeconds: 600)]
    [AutomaticRetry(Attempts = 2, DelaysInSeconds = [600])]
    public async Task<object?> RunAsync(CancellationToken cancellationToken) =>
        (await bus.InvokeAsync<PreviewRefreshResult>(new RefreshPreviews(), cancellationToken)).ToReport();
}

public static class RefreshPreviewsEndpoint
{
    /// <summary>
    /// <c>POST /api/admin/catalogue/refresh-previews</c> : le bouton « Re-vérifier les previews ». Déclenche la tâche
    /// <c>catalogue-refresh</c> (chaque lancement apparaît dans l'historique de <c>/jobs</c>) et répond 202 avec
    /// l'identifiant de l'exécution, que l'écran suit par <c>GET /api/admin/jobs/{id}</c>. Si une exécution est déjà
    /// en cours ou en file, on la suit au lieu d'en lancer une autre.
    /// </summary>
    [WolverinePost("/api/admin/catalogue/refresh-previews", OperationId = "refreshPreviews")]
    public static async Task<JobExecutionResponse> Post(IJobTrigger trigger, CancellationToken ct) =>
        new(await trigger.TriggerAsync(RefreshPreviewsJob.Id, ct));
}

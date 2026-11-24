using FluentValidation;
using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Ce qu'un contrôle a rapporté de l'extrait d'un morceau : une réponse de Deezer, ou aucune (quota, panne, service occupé).</summary>
internal enum PreviewOutcome
{
    Available,
    Missing,
    Unavailable,
}

/// <param name="Changed">L'état de l'extrait a changé (disponible devenu manquant, ou l'inverse).</param>
internal readonly record struct AppliedLookup(PreviewOutcome Outcome, bool Changed)
{
    /// <summary>Deezer a répondu : le morceau est à enregistrer. Sans réponse, son état reste celui du dernier contrôle réussi (piège 16).</summary>
    public bool Answered => Outcome != PreviewOutcome.Unavailable;
}

/// <summary>Un morceau recontrôlé : ce que Deezer en a dit, et si le résultat a bien été enregistré (faux : le morceau a été supprimé entre-temps).</summary>
internal sealed record PreviewRecheck(Track Track, AppliedLookup Applied, bool Saved);

/// <summary>
/// La seule règle qui applique la réponse de Deezer à un morceau : le contrôle nocturne, le job « Revérifier les manquants » et le bouton
/// « Revérifier » de l'admin passent tous par ici, pour que l'état de l'extrait se décide partout de la même façon.
/// </summary>
internal static class PreviewLookups
{
    public static AppliedLookup Apply(Track track, TrackMetadataLookup lookup, DateTimeOffset now)
    {
        switch (lookup)
        {
            // Morceau supprimé chez Deezer (code 800) : plus d'extrait.
            case TrackMetadataLookup.NotFound:
                return new AppliedLookup(PreviewOutcome.Missing, track.RecordPreviewCheck(PreviewCheck.Missing, now));
            case TrackMetadataLookup.Found found:
                var check = string.IsNullOrEmpty(found.Track.PreviewUrl) ? PreviewCheck.Missing : PreviewCheck.Available;
                var changed = track.RecordPreviewCheck(check, now);
                if (found.Track.Rank is { } rank)
                    track.RecordRank(rank, now);
                // L'album vient dans la même réponse : aucun appel de plus. Les genres se lisent ensuite, album par album.
                track.RecordAlbum(found.Track.AlbumId);
                return new AppliedLookup(check == PreviewCheck.Available ? PreviewOutcome.Available : PreviewOutcome.Missing, changed);
            // Deezer n'a pas répondu : l'état du morceau est inconnu, on n'y touche pas.
            default:
                return new AppliedLookup(PreviewOutcome.Unavailable, false);
        }
    }
}

/// <summary>
/// Recontrôle l'extrait de ces morceaux chez Deezer, par lots espacés comme le contrôle nocturne (quota, piège 16), et enregistre tout de suite
/// chaque lot (<see cref="ICatalogueStore.SaveRefreshedAsync"/> : sa propre requête, aucune transaction ouverte pendant les pauses).
/// </summary>
internal static class PreviewRechecker
{
    public static async Task<IReadOnlyList<PreviewRecheck>> RecheckAsync(
        IReadOnlyList<Track> tracks, ICatalogueStore store, ITrackMetadataSource deezer, TimeProvider time, RefreshOptions settings, CancellationToken ct)
    {
        var batchSize = Math.Max(1, settings.BatchSize);
        var results = new List<PreviewRecheck>(tracks.Count);
        for (var offset = 0; offset < tracks.Count; offset += batchSize)
        {
            if (offset > 0)
                await Task.Delay(settings.BatchDelay, time, ct);

            var batch = tracks.Skip(offset).Take(batchSize).ToList();
            var lookups = await Task.WhenAll(batch.Select(t => deezer.GetTrackAsync(t.DeezerTrackId, ct)));
            var now = time.GetUtcNow();
            var applied = batch.Select((track, i) => PreviewLookups.Apply(track, lookups[i], now)).ToList();

            var saved = await store.SaveRefreshedAsync([.. batch.Where((_, i) => applied[i].Answered)], ct);
            results.AddRange(batch.Select((track, i) => new PreviewRecheck(track, applied[i], applied[i].Answered && saved.Contains(track.Id))));
        }

        return results;
    }
}

/// <summary>Les morceaux à recontrôler, chargés **détachés** (le contrôle appelle Deezer : rien ne reste suivi ni sous transaction).</summary>
public sealed record RecheckTargets(IReadOnlyList<Track> Tracks);

/// <summary>Les morceaux dont l'admin veut recontrôler l'extrait (la fiche ou la sélection du pool).</summary>
public sealed record RecheckTrackPreviews(IReadOnlyList<int> TrackIds);

public sealed class RecheckTrackPreviewsValidator : AbstractValidator<RecheckTrackPreviews>
{
    /// <summary>Au plus ce nombre de morceaux par appel : trois lots de dix, quelques secondes d'attente à l'écran.</summary>
    public const int MaxTracks = 30;

    public RecheckTrackPreviewsValidator()
    {
        RuleFor(x => x.TrackIds).NotEmpty().Must(ids => ids.Count <= MaxTracks);
        RuleForEach(x => x.TrackIds).GreaterThan(0);
    }
}

/// <summary>L'état de l'extrait d'un morceau après le contrôle.</summary>
/// <param name="PreviewStatus"><c>unknown</c>, <c>available</c> ou <c>missing</c>.</param>
/// <param name="Answered">Deezer a répondu : faux, l'état est celui d'avant (quota, panne) et l'écran propose de réessayer.</param>
public sealed record RecheckedTrack(
    int Id, string PreviewStatus, DateTimeOffset? PreviewCheckedAt, DateTimeOffset? PreviewMissingSince, bool Answered);

public sealed record RecheckTrackPreviewsResponse(IReadOnlyList<RecheckedTrack> Tracks);

public static class RecheckTrackPreviewsEndpoint
{
    public static async Task<RecheckTargets> LoadAsync(RecheckTrackPreviews request, ICatalogueStore store, CancellationToken ct) =>
        new(await store.ListByIdsAsync([.. request.TrackIds.Distinct()], ct));

    public static ProblemDetails Validate(RecheckTargets targets) =>
        targets.Tracks.Count == 0 ? CatalogueProblems.TrackNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>POST /api/admin/catalogue/tracks/recheck-previews</c> : demande à Deezer l'extrait de ces morceaux (30 au plus) et enregistre l'état tout
    /// de suite, sans attendre le contrôle de la nuit. Un morceau sur lequel Deezer n'a pas répondu garde son état (<c>answered</c> faux).
    /// Un identifiant inconnu est ignoré ; aucun connu : 404. Un morceau désactivé se recontrôle aussi (l'admin le demande).
    /// </summary>
    // Pas de transaction Wolverine : l'appel à Deezer dure des secondes, et le store enregistre chaque lot par sa propre requête.
    [NonTransactional]
    [WolverinePost("/api/admin/catalogue/tracks/recheck-previews", OperationId = "recheckTrackPreviews")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<RecheckTrackPreviewsResponse> Post(
        RecheckTrackPreviews request, [NotBody] RecheckTargets targets, ICatalogueStore store, ITrackMetadataSource deezer, TimeProvider time,
        IOptionsMonitor<RefreshOptions> options, CancellationToken ct)
    {
        var results = await PreviewRechecker.RecheckAsync(targets.Tracks, store, deezer, time, options.CurrentValue, ct);
        return new RecheckTrackPreviewsResponse([
            .. results.Select(r => new RecheckedTrack(
                r.Track.Id, TrackMapping.Name(r.Track.PreviewStatus), r.Track.PreviewCheckedAt, r.Track.PreviewMissingSince, r.Saved)),
        ]);
    }
}

/// <summary>Revérifie chez Deezer les morceaux actifs marqués sans extrait. Lancé à la main depuis <c>/jobs</c> (tâche <c>catalogue-recheck-missing-previews</c>).</summary>
public sealed record RecheckMissingPreviews;

/// <summary>Compte rendu de l'exécution, lu par <c>GET /api/admin/jobs/last-runs</c> et <c>/jobs</c>.</summary>
/// <param name="Checked">Morceaux manquants recontrôlés.</param>
/// <param name="Recovered">Redevenus disponibles.</param>
/// <param name="StillMissing">Toujours sans extrait chez Deezer : à remplacer ou désactiver.</param>
/// <param name="Failed">Deezer n'a pas répondu (quota, panne) : leur état est inchangé, la tâche se relance.</param>
public sealed record MissingPreviewsRecheckResult(int Checked, int Recovered, int StillMissing, int Failed)
{
    /// <summary>Un dictionnaire plutôt que le record : Hangfire n'écrit pas les propriétés à zéro (comme <see cref="PreviewRefreshResult.ToReport"/>).</summary>
    public Dictionary<string, int> ToReport() => new()
    {
        ["checked"] = Checked,
        ["recovered"] = Recovered,
        ["stillMissing"] = StillMissing,
        ["failed"] = Failed,
    };
}

public static class RecheckMissingPreviewsHandler
{
    // Pas de transaction Wolverine : comme le contrôle nocturne, des lots espacés qui s'enregistrent un à un.
    [NonTransactional]
    public static async Task<MissingPreviewsRecheckResult> Handle(
        RecheckMissingPreviews command, ICatalogueStore store, ITrackMetadataSource deezer, TimeProvider time,
        IOptionsMonitor<RefreshOptions> options, ILogger<RecheckMissingPreviews> logger, CancellationToken ct)
    {
        var missing = await store.ListMissingPreviewTracksAsync(ct);
        var results = await PreviewRechecker.RecheckAsync(missing, store, deezer, time, options.CurrentValue, ct);

        // Un morceau supprimé pendant le contrôle (réponse non enregistrée) ne compte nulle part.
        var recovered = results.Count(r => r.Saved && r.Applied.Outcome == PreviewOutcome.Available);
        var stillMissing = results.Count(r => r.Saved && r.Applied.Outcome == PreviewOutcome.Missing);
        var failed = results.Count(r => !r.Applied.Answered);
        CatalogueLog.MissingPreviewsRechecked(logger, results.Count, recovered, stillMissing, failed);
        return new MissingPreviewsRecheckResult(results.Count, recovered, stillMissing, failed);
    }
}

/// <summary>
/// Tâche <c>catalogue-recheck-missing-previews</c> : **jamais planifiée** (le cron est « jamais »), elle se lance à la main depuis <c>/jobs</c>.
/// Le contrôle nocturne recontrôle déjà tout le pool ; celle-ci donne la réponse tout de suite pour les seuls morceaux sans extrait (quelques
/// dizaines : une minute ou deux). Aucun nouvel essai automatique : on la relance soi-même.
/// </summary>
public sealed class RecheckMissingPreviewsJob(IMessageBus bus) : IScheduledJob
{
    public const string Id = "catalogue-recheck-missing-previews";

    public static string DefaultCron => Cron.Never();

    [DisableConcurrentExecution(timeoutInSeconds: 600)]
    [AutomaticRetry(Attempts = 0)]
    public async Task<object?> RunAsync(CancellationToken cancellationToken) =>
        (await bus.InvokeAsync<MissingPreviewsRecheckResult>(new RecheckMissingPreviews(), cancellationToken)).ToReport();
}

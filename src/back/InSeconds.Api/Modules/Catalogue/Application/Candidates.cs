using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

// Le sas de l'admin (« À valider ») : des morceaux de Deezer qui attendent la décision de l'admin avant d'entrer dans le pool. L'import les lit chez
// Deezer en arrière-plan, par lots espacés comme le contrôle nocturne (Deezer limite à ~50 requêtes / 5 s, piège 16) ; l'admin les écoute, puis les
// ajoute (même logique que l'ajout à la main) ou les écarte. Rien n'entre au pool sans son clic.

/// <summary>Les messages d'un lot sont envoyés l'un après l'autre, espacés de <see cref="RefreshOptions.BatchDelay"/> : le premier tout de suite.</summary>
internal static class CandidateBatches
{
    public static void Schedule(OutgoingMessages outgoing, IReadOnlyList<int> ids, RefreshOptions options, Func<IReadOnlyList<int>, object> message)
    {
        var size = Math.Max(1, options.BatchSize);
        var batch = 0;
        for (var offset = 0; offset < ids.Count; offset += size, batch++)
        {
            var current = message([.. ids.Skip(offset).Take(size)]);
            var delay = TimeSpan.FromTicks(options.BatchDelay.Ticks * batch);
            if (delay <= TimeSpan.Zero)
                outgoing.Add(current);
            else
                outgoing.Delay(current, delay);
        }
    }
}

/// <summary>Un morceau à importer : son identifiant Deezer et, si l'import en donne une, sa priorité (A, B ou C).</summary>
public sealed record ImportCandidateItem(long DeezerTrackId, string? Priority = null);

public sealed record ImportCandidates(IReadOnlyList<ImportCandidateItem> Items);

/// <param name="Created">Les candidats neufs, à lire chez Deezer.</param>
/// <param name="AlreadyCandidates">Ceux qui étaient déjà dans le sas (la priorité est reprise si le candidat n'en avait pas).</param>
/// <param name="AlreadyInCatalogue">Ceux qui sont déjà au pool : ils n'entrent pas dans le sas.</param>
public sealed record ImportCandidatesResult(int Created, int AlreadyCandidates, int AlreadyInCatalogue);

public sealed class ImportCandidatesValidator : AbstractValidator<ImportCandidates>
{
    public ImportCandidatesValidator()
    {
        RuleFor(x => x.Items).NotEmpty().Must(i => i is null || i.Count <= Candidate.MaxImport)
            .WithMessage($"Au plus {Candidate.MaxImport} morceaux à la fois.");
        RuleForEach(x => x.Items).Must(i => i is { DeezerTrackId: > 0 } && Candidate.IsValidPriority(i.Priority));
    }
}

/// <summary>Ce que l'import a chargé : les morceaux demandés (un par identifiant), ceux du pool et les candidats qui existent déjà.</summary>
public sealed record CandidatesImportPlan(
    IReadOnlyList<ImportCandidateItem> Items, IReadOnlySet<long> InCatalogue, IReadOnlyDictionary<long, Candidate> Existing);

public static class ImportCandidatesEndpoint
{
    public static async Task<CandidatesImportPlan> LoadAsync(ImportCandidates request, ICatalogueStore store, CancellationToken ct)
    {
        // Un identifiant qui revient garde la première priorité donnée.
        var items = request.Items
            .GroupBy(i => i.DeezerTrackId)
            .Select(g => new ImportCandidateItem(g.Key, g.Select(i => i.Priority).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p))))
            .ToList();
        var ids = items.Select(i => i.DeezerTrackId).ToList();
        var inPool = await store.DeezerIdsInPoolAsync(ids, ct);
        var existing = (await store.FindCandidatesByDeezerIdsAsync(ids, ct)).ToDictionary(c => c.DeezerTrackId);
        return new CandidatesImportPlan(items, inPool, existing);
    }

    /// <summary>
    /// <c>POST /api/admin/catalogue/candidates</c> <c>{ items: [{ deezerTrackId, priority? }] }</c> : met ces morceaux dans le sas, puis les lit chez Deezer en
    /// arrière-plan (lots de 10, espacés de 1,5 s) : l'écran se remplit au fil de l'eau. 1000 morceaux au plus à la fois. Un morceau déjà au pool
    /// n'entre pas, un morceau déjà candidat n'est pas dupliqué.
    /// </summary>
    [WolverinePost("/api/admin/catalogue/candidates", OperationId = "importCandidates")]
    public static async Task<(ImportCandidatesResult, OutgoingMessages)> Post(
        ImportCandidates request, [NotBody] CandidatesImportPlan plan, ICatalogueStore store, IOptionsMonitor<RefreshOptions> options,
        TimeProvider time, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var toRead = new List<int>();
        int created = 0, known = 0, inCatalogue = 0;
        foreach (var item in plan.Items)
        {
            if (plan.InCatalogue.Contains(item.DeezerTrackId))
            {
                inCatalogue++;
                continue;
            }

            if (plan.Existing.TryGetValue(item.DeezerTrackId, out var existing))
            {
                known++;
                if (existing.Priority is null && !string.IsNullOrWhiteSpace(item.Priority))
                    existing.SetPriority(item.Priority);
                if (existing.Status == CandidateStatus.Pending && !existing.IsDismissed)
                    toRead.Add(existing.Id);
                continue;
            }

            var candidate = Candidate.Create(item.DeezerTrackId, item.Priority, now);
            await store.AddCandidateAsync(candidate, ct);
            toRead.Add(candidate.Id);
            created++;
        }

        var messages = new OutgoingMessages();
        CandidateBatches.Schedule(messages, toRead, options.CurrentValue, ids => new ReadCandidates(ids));
        return (new ImportCandidatesResult(created, known, inCatalogue), messages);
    }
}

public static class ListCandidatesEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/catalogue/candidates</c> : tout le sas (écartés compris), dans l'ordre d'import. L'écran le relit tant que des candidats
    /// sont <c>pending</c> ou en cours d'ajout.
    /// </summary>
    [WolverineGet("/api/admin/catalogue/candidates", OperationId = "listCandidates")]
    public static Task<IReadOnlyList<CandidateItem>> Get(ICatalogueQueries queries, CancellationToken ct) => queries.ListCandidatesAsync(ct);
}

/// <summary>Lit chez Deezer ces candidats (un lot : le message est envoyé avec la pause voulue avant lui).</summary>
public sealed record ReadCandidates(IReadOnlyList<int> CandidateIds);

public static class ReadCandidatesHandler
{
    // Pas de transaction Wolverine : la lecture appelle Deezer, et chaque candidat est enregistré tout de suite par le store.
    [NonTransactional]
    public static async Task Handle(
        ReadCandidates message, ICatalogueStore store, ITrackMetadataSource deezer, TimeProvider time, ILogger<ReadCandidates> logger,
        CancellationToken ct)
    {
        var candidates = await store.ListCandidatesToReadAsync(message.CandidateIds, ct);
        if (candidates.Count == 0)
            return;

        var lookups = await Task.WhenAll(candidates.Select(c => deezer.GetTrackAsync(c.DeezerTrackId, ct)));
        var now = time.GetUtcNow();
        var read = new List<Candidate>();
        int notFound = 0, unavailable = 0;
        for (var i = 0; i < candidates.Count; i++)
        {
            switch (lookups[i])
            {
                case TrackMetadataLookup.Found found:
                    candidates[i].RecordRead(TrackMapping.ToMetadata(found.Track), now);
                    read.Add(candidates[i]);
                    break;
                case TrackMetadataLookup.NotFound:
                    candidates[i].RecordNotFound(now);
                    read.Add(candidates[i]);
                    notFound++;
                    break;
                default:
                    // Deezer n'a pas répondu (quota, panne) : le candidat reste à lire, « Relire » le reprend.
                    unavailable++;
                    break;
            }
        }

        await store.SaveCandidateReadsAsync(read, ct);
        CatalogueLog.CandidatesRead(logger, read.Count - notFound, notFound, unavailable);
    }
}

public sealed record RereadCandidatesResult(int Count);

public static class RereadCandidatesEndpoint
{
    public static async Task<IReadOnlyList<int>> LoadAsync(ICatalogueStore store, CancellationToken ct) => await store.ListPendingCandidateIdsAsync(ct);

    /// <summary><c>POST /api/admin/catalogue/candidates/reread</c> : relance la lecture des candidats que Deezer n'avait pas pu renseigner.</summary>
    [WolverinePost("/api/admin/catalogue/candidates/reread", OperationId = "rereadCandidates")]
    public static (RereadCandidatesResult, OutgoingMessages) Post([NotBody] IReadOnlyList<int> pending, IOptionsMonitor<RefreshOptions> options)
    {
        var messages = new OutgoingMessages();
        CandidateBatches.Schedule(messages, pending, options.CurrentValue, ids => new ReadCandidates(ids));
        return (new RereadCandidatesResult(pending.Count), messages);
    }
}

/// <param name="Dismissed">Vrai : les écarter ; faux : les remettre dans le sas.</param>
public sealed record DismissCandidates(IReadOnlyList<int> CandidateIds, bool Dismissed);

public sealed class DismissCandidatesValidator : AbstractValidator<DismissCandidates>
{
    public DismissCandidatesValidator()
    {
        RuleFor(x => x.CandidateIds).NotEmpty().Must(i => i is null || i.Count <= Candidate.MaxImport)
            .WithMessage($"Au plus {Candidate.MaxImport} candidats à la fois.");
    }
}

public static class DismissCandidatesEndpoint
{
    public static async Task<IReadOnlyList<Candidate>> LoadAsync(DismissCandidates request, ICatalogueStore store, CancellationToken ct) =>
        await store.FindCandidatesAsync(request.CandidateIds.Distinct().ToList(), ct);

    /// <summary>
    /// <c>PUT /api/admin/catalogue/candidates/dismissed</c> <c>{ candidateIds, dismissed }</c> : écarte ces candidats (ils restent dans le sas, écartés,
    /// pour ne pas être importés de nouveau) ou les remet, 204. Un candidat inconnu ou en cours d'ajout est ignoré.
    /// </summary>
    [WolverinePut("/api/admin/catalogue/candidates/dismissed", OperationId = "dismissCandidates")]
    [EmptyResponse]
    public static void Put(DismissCandidates request, [NotBody] IReadOnlyList<Candidate> candidates, TimeProvider time)
    {
        var now = time.GetUtcNow();
        foreach (var candidate in candidates.Where(c => !c.IsAdding(now)))
            candidate.SetDismissed(request.Dismissed, now);
    }
}

public sealed record AddCandidates(IReadOnlyList<int> CandidateIds);

/// <param name="Queued">Les candidats dont l'ajout est lancé : ils quittent le sas dès que le lot passe.</param>
/// <param name="Skipped">Ceux qui ne peuvent pas l'être : inconnus, pas lus, sans extrait, écartés, déjà en cours d'ajout ou déjà au pool.</param>
public sealed record AddCandidatesResult(int Queued, int Skipped);

public sealed class AddCandidatesValidator : AbstractValidator<AddCandidates>
{
    public AddCandidatesValidator()
    {
        RuleFor(x => x.CandidateIds).NotEmpty().Must(i => i is null || i.Count <= Candidate.MaxImport)
            .WithMessage($"Au plus {Candidate.MaxImport} candidats à la fois.");
    }
}

/// <summary>Ce que la demande d'ajout a chargé : les candidats qui peuvent l'être, et le nombre de ceux qui ne le peuvent pas.</summary>
public sealed record CandidatesAddPlan(IReadOnlyList<Candidate> Eligible, int Skipped);

public static class AddCandidatesEndpoint
{
    public static async Task<CandidatesAddPlan> LoadAsync(AddCandidates request, ICatalogueStore store, TimeProvider time, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var wanted = request.CandidateIds.Distinct().ToList();
        var candidates = await store.FindCandidatesAsync(wanted, ct);
        var inPool = await store.DeezerIdsInPoolAsync([.. candidates.Select(c => c.DeezerTrackId)], ct);
        var eligible = candidates.Where(c => c.CanBeAdded(now) && !inPool.Contains(c.DeezerTrackId)).ToList();
        return new CandidatesAddPlan(eligible, wanted.Count - eligible.Count);
    }

    /// <summary>
    /// <c>POST /api/admin/catalogue/candidates/add</c> <c>{ candidateIds }</c> : demande l'ajout au pool de ces candidats. Ils sont ajoutés en
    /// arrière-plan, par lots espacés (une lecture d'album chez Deezer par morceau), avec la logique de l'ajout à la main ; chacun quitte le sas
    /// une fois ajouté.
    /// </summary>
    [WolverinePost("/api/admin/catalogue/candidates/add", OperationId = "addCandidates")]
    public static (AddCandidatesResult, OutgoingMessages) Post(
        AddCandidates request, [NotBody] CandidatesAddPlan plan, IOptionsMonitor<RefreshOptions> options, TimeProvider time)
    {
        var now = time.GetUtcNow();
        foreach (var candidate in plan.Eligible)
            candidate.RequestAdd(now);

        var messages = new OutgoingMessages();
        CandidateBatches.Schedule(messages, [.. plan.Eligible.Select(c => c.Id)], options.CurrentValue, ids => new AddCandidatesToCatalogue(ids));
        return (new AddCandidatesResult(plan.Eligible.Count, plan.Skipped), messages);
    }
}

/// <summary>Ajoute au pool ces candidats dont l'ajout est demandé (un lot).</summary>
public sealed record AddCandidatesToCatalogue(IReadOnlyList<int> CandidateIds);

public static class AddCandidatesToCatalogueHandler
{
    // La transaction est celle de Wolverine : les morceaux ajoutés et les candidats retirés s'enregistrent ensemble. Un lot, c'est 10 lectures
    // d'album au plus (quelques secondes).
    public static async Task<OutgoingMessages> Handle(
        AddCandidatesToCatalogue message, ICatalogueStore store, IAlbumSource albums, IOptionsMonitor<WaveformOptions> waveformOptions,
        TimeProvider time, ILogger<AddCandidatesToCatalogue> logger, CancellationToken ct)
    {
        var outgoing = new OutgoingMessages();
        var requested = (await store.FindCandidatesAsync(message.CandidateIds, ct)).Where(c => c.AddRequestedAt is not null).ToList();
        if (requested.Count == 0)
            return outgoing;

        var inPool = await store.DeezerIdsInPoolAsync([.. requested.Select(c => c.DeezerTrackId)], ct);
        var toAdd = requested.Where(c => c.Status == CandidateStatus.Ready && !inPool.Contains(c.DeezerTrackId)).ToList();
        // Déjà au pool entre-temps (ajouté à la main) : il quitte le sas sans doublon.
        foreach (var gone in requested.Except(toAdd))
            store.RemoveCandidate(gone);

        // Les genres se lisent sur l'album : une réponse indisponible n'empêche pas l'ajout, le contrôle nocturne les rattrape.
        var lookups = await Task.WhenAll(toAdd.Select(c => c.AlbumId is { } albumId ? albums.GetAlbumAsync(albumId, ct) : Task.FromResult<AlbumLookup?>(null)!));
        // Les genres d'un lot se réunissent d'un coup : deux morceaux d'un même genre neuf ne le créent pas deux fois.
        var genres = (await store.EnsureGenresAsync(
            [.. lookups.OfType<AlbumLookup.Found>().SelectMany(f => f.Genres.Select(g => new GenreRef(g.Id, g.Name)))], ct)).ToDictionary(g => g.Id);

        var now = time.GetUtcNow();
        var withPreview = false;
        for (var i = 0; i < toAdd.Count; i++)
        {
            var track = Track.Create(toAdd[i].ToMetadata(), now);
            switch (lookups[i])
            {
                case AlbumLookup.Found found:
                    track.RecordGenres([.. found.Genres.Select(g => genres[g.Id])], now);
                    break;
                case AlbumLookup.NotFound:
                    track.RecordGenres([], now);
                    break;
            }

            await store.AddAsync(track, ct);
            store.RemoveCandidate(toAdd[i]);
            withPreview |= track.HasPreview;
        }

        // Comme l'ajout à la main : la forme d'onde se calcule plus tard, hors de la requête, par un message différé qui prend tous les morceaux sans forme.
        if (withPreview && waveformOptions.CurrentValue.ComputeOnAdd)
            outgoing.Delay(new ComputeWaveforms(), TimeSpan.FromMinutes(Math.Max(1, waveformOptions.CurrentValue.DelayMinutes)));
        CatalogueLog.CandidatesAdded(logger, toAdd.Count, requested.Count - toAdd.Count);
        return outgoing;
    }
}

/// <summary>L'adresse de l'extrait d'un candidat, signée : elle expire au bout de 15 min (piège 14).</summary>
public sealed record CandidatePreview(string Url);

/// <summary>Ce que l'écoute d'un candidat a trouvé : le candidat, et la réponse de Deezer pour son extrait.</summary>
public sealed record CandidatePreviewLookup(Candidate? Candidate, PreviewLookup? Preview);

public static class GetCandidatePreviewEndpoint
{
    public static async Task<CandidatePreviewLookup> LoadAsync(int id, ICatalogueStore store, IPreviewProvider previews, CancellationToken ct)
    {
        var candidate = await store.FindCandidateAsync(id, ct);
        return candidate is null
            ? new CandidatePreviewLookup(null, null)
            : new CandidatePreviewLookup(candidate, await previews.GetPreviewAsync(candidate.DeezerTrackId, ct));
    }

    public static ProblemDetails Validate(CandidatePreviewLookup lookup) => lookup switch
    {
        { Candidate: null } => CatalogueProblems.CandidateNotFound(),
        { Preview: PreviewLookup.Unavailable } => CatalogueProblems.DeezerUnavailable(),
        { Preview: PreviewLookup.Missing } => CatalogueProblems.CandidatePreviewMissing(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>GET /api/admin/catalogue/candidates/{id}/preview</c> : une adresse d'extrait neuve (demandée à Deezer à chaque clic, car elle expire).
    /// 404 si le candidat n'existe pas, 422 <c>catalogue.candidate_preview_missing</c> si Deezer n'a pas d'extrait, 503 si Deezer ne répond pas.
    /// </summary>
    [WolverineGet("/api/admin/catalogue/candidates/{id}/preview", OperationId = "getCandidatePreview")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static CandidatePreview Get([NotBody] CandidatePreviewLookup lookup) => new(((PreviewLookup.Found)lookup.Preview!).Url);
}

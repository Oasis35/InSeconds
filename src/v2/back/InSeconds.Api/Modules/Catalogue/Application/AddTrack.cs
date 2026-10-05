using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

public sealed record AddTrack(long DeezerTrackId);

public sealed class AddTrackValidator : AbstractValidator<AddTrack>
{
    public AddTrackValidator() => RuleFor(x => x.DeezerTrackId).GreaterThan(0);
}

/// <summary>Ce que l'ajout a trouvé : un doublon (sans appeler Deezer), ou la réponse de Deezer.</summary>
public sealed record TrackToAdd(bool Duplicate, TrackMetadataLookup? Lookup);

public static class AddTrackEndpoint
{
    public static async Task<TrackToAdd> LoadAsync(AddTrack request, ICatalogueStore store, ITrackMetadataSource deezer, CancellationToken ct) =>
        await store.DeezerIdTakenAsync(request.DeezerTrackId, null, ct)
            ? new TrackToAdd(true, null)
            : new TrackToAdd(false, await deezer.GetTrackAsync(request.DeezerTrackId, ct));

    public static ProblemDetails Validate(TrackToAdd plan) => plan switch
    {
        { Duplicate: true } => CatalogueProblems.DuplicateDeezerId(),
        { Lookup: TrackMetadataLookup.Unavailable } => CatalogueProblems.DeezerUnavailable(),
        { Lookup: TrackMetadataLookup.NotFound } => CatalogueProblems.NotFoundOnDeezer(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>POST /api/admin/catalogue/tracks</c> : ajoute au pool un morceau de Deezer, avec son année, son rang
    /// et l'état de son extrait. Un identifiant déjà dans le pool répond 409 (v1 : l'ajout était alors un
    /// succès silencieux) ; deux ajouts simultanés du même identifiant : l'index unique refuse le second,
    /// aussi en 409 (<c>TrackConflictExceptionHandler</c>).
    /// </summary>
    [WolverinePost("/api/admin/catalogue/tracks", OperationId = "addTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static async Task<TrackSummary> Post(
        AddTrack request, TrackToAdd plan, ICatalogueStore store, IOptionsMonitor<CatalogueOptions> options, TimeProvider time, CancellationToken ct)
    {
        var found = (TrackMetadataLookup.Found)plan.Lookup!;
        var track = Track.Create(TrackMapping.ToMetadata(found.Track), time.GetUtcNow());
        await store.AddAsync(track, ct);
        return TrackMapping.ToSummary(track, options.CurrentValue);
    }
}

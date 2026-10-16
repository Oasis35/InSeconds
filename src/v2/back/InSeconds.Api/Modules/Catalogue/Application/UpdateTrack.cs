using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Le nouvel identifiant Deezer d'un morceau à actualiser (v1 : <c>UpdateTrack</c>).</summary>
public sealed record UpdateTrack(long DeezerTrackId);

public sealed class UpdateTrackValidator : AbstractValidator<UpdateTrack>
{
    public UpdateTrackValidator() => RuleFor(x => x.DeezerTrackId).GreaterThan(0);
}

/// <summary>Ce que l'actualisation a trouvé, dans l'ordre où elle le cherche : on n'appelle Deezer que si rien ne l'interdit.</summary>
public sealed record TrackRefreshPlan(Track? Track, bool InUse, bool IdTaken, TrackMetadataLookup? Lookup);

public static class UpdateTrackEndpoint
{
    public static async Task<TrackRefreshPlan> LoadAsync(
        int id, UpdateTrack request, ICatalogueStore store, ITrackUsage usage, ITrackMetadataSource deezer, CancellationToken ct)
    {
        var track = await store.FindAsync(id, ct);
        if (track is null)
            return new TrackRefreshPlan(null, false, false, null);

        var usages = await usage.GetAsync([id], ct);
        if (usages.GetValueOrDefault(id, TrackUsage.None).IsUsed)
            return new TrackRefreshPlan(track, true, false, null);

        if (track.DeezerTrackId != request.DeezerTrackId && await store.DeezerIdTakenAsync(request.DeezerTrackId, id, ct))
            return new TrackRefreshPlan(track, false, true, null);

        return new TrackRefreshPlan(track, false, false, await deezer.GetTrackAsync(request.DeezerTrackId, ct));
    }

    public static ProblemDetails Validate(TrackRefreshPlan plan) => plan switch
    {
        { Track: null } => CatalogueProblems.TrackNotFound(),
        { InUse: true } => CatalogueProblems.TrackInUse("modifié"),
        { IdTaken: true } => CatalogueProblems.DuplicateDeezerId(),
        { Lookup: TrackMetadataLookup.Unavailable } => CatalogueProblems.DeezerUnavailable(),
        { Lookup: TrackMetadataLookup.NotFound } => CatalogueProblems.NotFoundOnDeezer(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>PUT /api/admin/catalogue/tracks/{id}</c> : actualise un morceau (typiquement sans extrait) depuis
    /// Deezer : remplace l'identifiant Deezer, l'artiste, le titre, la pochette, l'année, le rang et l'état de
    /// l'extrait. Interdit s'il a déjà servi dans un défi (409 <c>catalogue.track_in_use</c>). Un identifiant
    /// pris par un autre morceau : 409 <c>catalogue.duplicate_deezer_id</c>.
    /// </summary>
    [WolverinePut("/api/admin/catalogue/tracks/{id}", OperationId = "updateTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static TrackSummary Put(UpdateTrack request, TrackRefreshPlan plan, IOptionsMonitor<CatalogueOptions> options, TimeProvider time)
    {
        var found = (TrackMetadataLookup.Found)plan.Lookup!;
        plan.Track!.ReplaceDeezerSource(TrackMapping.ToMetadata(found.Track), time.GetUtcNow());
        return TrackMapping.ToSummary(plan.Track, options.CurrentValue);
    }
}

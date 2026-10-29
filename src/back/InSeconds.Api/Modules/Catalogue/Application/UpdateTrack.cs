using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Le nouvel identifiant Deezer d'un morceau à actualiser.</summary>
public sealed record UpdateTrack(long DeezerTrackId);

public sealed class UpdateTrackValidator : AbstractValidator<UpdateTrack>
{
    public UpdateTrackValidator() => RuleFor(x => x.DeezerTrackId).GreaterThan(0);
}

/// <summary>Ce que l'actualisation a trouvé, dans l'ordre où elle le cherche : on n'appelle Deezer que si rien ne l'interdit.</summary>
/// <param name="Album">Les genres du nouvel album, lus seulement si l'album change (ou si ceux du morceau n'ont jamais été lus) : absents, le contrôle nocturne les rattrape.</param>
public sealed record TrackRefreshPlan(Track? Track, bool InUse, bool IdTaken, TrackMetadataLookup? Lookup, AlbumLookup? Album);

public static class UpdateTrackEndpoint
{
    public static async Task<TrackRefreshPlan> LoadAsync(
        int id, UpdateTrack request, ICatalogueStore store, ITrackPoolUsage usage, ITrackMetadataSource deezer, IAlbumSource albums,
        CancellationToken ct)
    {
        // Avec ses genres : s'il change d'album, les remplacer supprime ceux de l'ancien (sinon EF ne verrait aucune ligne à retirer).
        var track = await store.FindWithGenresAsync(id, ct);
        if (track is null)
            return new TrackRefreshPlan(null, false, false, null, null);

        var usages = await usage.GetAsync([id], ct);
        if (usages.GetValueOrDefault(id, TrackUsage.None).IsUsed)
            return new TrackRefreshPlan(track, true, false, null, null);

        if (track.DeezerTrackId != request.DeezerTrackId && await store.DeezerIdTakenAsync(request.DeezerTrackId, id, ct))
            return new TrackRefreshPlan(track, false, true, null, null);

        var lookup = await deezer.GetTrackAsync(request.DeezerTrackId, ct);
        // Comme à l'ajout : les genres du nouvel album tout de suite (un appel de plus), seulement s'ils ne sont pas déjà ceux du morceau.
        var album = lookup is TrackMetadataLookup.Found { Track.AlbumId: { } albumId } && (albumId != track.AlbumId || track.GenresCheckedAt is null)
            ? await albums.GetAlbumAsync(albumId, ct)
            : null;
        return new TrackRefreshPlan(track, false, false, lookup, album);
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
    /// l'extrait, et les genres s'il change d'album (ceux de l'ancien sont retirés). Interdit s'il a déjà servi dans un défi (409 <c>catalogue.track_in_use</c>). Un identifiant
    /// pris par un autre morceau : 409 <c>catalogue.duplicate_deezer_id</c>.
    /// </summary>
    [WolverinePut("/api/admin/catalogue/tracks/{id}", OperationId = "updateTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static async Task<TrackSummary> Put(
        UpdateTrack request, TrackRefreshPlan plan, ICatalogueStore store, IOptionsMonitor<CatalogueOptions> options, TimeProvider time,
        CancellationToken ct)
    {
        var found = (TrackMetadataLookup.Found)plan.Lookup!;
        var now = time.GetUtcNow();
        var track = plan.Track!;
        track.ReplaceDeezerSource(TrackMapping.ToMetadata(found.Track), now);
        await TrackMapping.RecordAlbumGenresAsync(track, plan.Album, store, now, ct);

        return TrackMapping.ToSummary(track, options.CurrentValue);
    }
}

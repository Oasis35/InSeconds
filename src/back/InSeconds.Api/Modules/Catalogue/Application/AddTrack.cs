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
/// <param name="Album">Les genres de l'album du morceau, lus tout de suite (un appel de plus) : absents, le contrôle nocturne les rattrape.</param>
public sealed record TrackToAdd(bool Duplicate, TrackMetadataLookup? Lookup, AlbumLookup? Album);

public static class AddTrackEndpoint
{
    public static async Task<TrackToAdd> LoadAsync(
        AddTrack request, ICatalogueStore store, ITrackMetadataSource deezer, IAlbumSource albums, CancellationToken ct)
    {
        if (await store.DeezerIdTakenAsync(request.DeezerTrackId, null, ct))
            return new TrackToAdd(true, null, null);

        var lookup = await deezer.GetTrackAsync(request.DeezerTrackId, ct);
        // Le genre se lit sur l'album : un second appel, seulement si le morceau est trouvé et qu'il a un album. Une réponse Deezer
        // indisponible n'empêche pas l'ajout (le contrôle nocturne rattrape).
        var album = lookup is TrackMetadataLookup.Found { Track.AlbumId: { } albumId } ? await albums.GetAlbumAsync(albumId, ct) : null;
        return new TrackToAdd(false, lookup, album);
    }

    public static ProblemDetails Validate(TrackToAdd plan) => plan switch
    {
        { Duplicate: true } => CatalogueProblems.DuplicateDeezerId(),
        { Lookup: TrackMetadataLookup.Unavailable } => CatalogueProblems.DeezerUnavailable(),
        { Lookup: TrackMetadataLookup.NotFound } => CatalogueProblems.NotFoundOnDeezer(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>POST /api/admin/catalogue/tracks</c> : ajoute au pool un morceau de Deezer, avec son année, son rang
    /// et l'état de son extrait. Un identifiant déjà dans le pool répond 409 ; deux ajouts simultanés du même identifiant : l'index unique refuse le second,
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
        var now = time.GetUtcNow();
        var track = Track.Create(TrackMapping.ToMetadata(found.Track), now);
        await TrackMapping.RecordAlbumGenresAsync(track, plan.Album, store, now, ct);

        await store.AddAsync(track, ct);
        return TrackMapping.ToSummary(track, options.CurrentValue);
    }
}

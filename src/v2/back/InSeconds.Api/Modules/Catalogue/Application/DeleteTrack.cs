using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

public sealed record TrackDeletion(Track? Track, bool InUse);

public static class DeleteTrackEndpoint
{
    public static async Task<TrackDeletion> LoadAsync(int id, ICatalogueStore store, ITrackUsage usage, CancellationToken ct)
    {
        var track = await store.FindAsync(id, ct);
        if (track is null)
            return new TrackDeletion(null, false);

        var usages = await usage.GetAsync([id], ct);
        return new TrackDeletion(track, usages.GetValueOrDefault(id, TrackUsage.None).IsUsed);
    }

    public static ProblemDetails Validate(TrackDeletion deletion) => deletion switch
    {
        { Track: null } => CatalogueProblems.TrackNotFound(),
        { InUse: true } => CatalogueProblems.TrackInUse("supprimé"),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>DELETE /api/admin/catalogue/tracks/{id}</c> : supprime un morceau du pool, 204. Interdit s'il a déjà
    /// servi dans un défi (409 <c>catalogue.track_in_use</c>) : la désactivation est l'alternative.
    /// </summary>
    [WolverineDelete("/api/admin/catalogue/tracks/{id}", OperationId = "deleteTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Delete([NotBody] TrackDeletion deletion, ICatalogueStore store) => store.Remove(deletion.Track!);
}

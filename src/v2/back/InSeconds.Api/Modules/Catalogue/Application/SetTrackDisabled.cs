using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

public sealed record SetTrackDisabled(bool IsDisabled);

public sealed record TrackDisabledResponse(int Id, bool IsDisabled);

/// <summary>Le morceau, et sa présence dans le défi du jour (cherchée seulement quand on veut le désactiver).</summary>
public sealed record DisableAttempt(Track? Track, bool InTodayChallenge);

public static class SetTrackDisabledEndpoint
{
    public static async Task<DisableAttempt> LoadAsync(
        int id, SetTrackDisabled request, ICatalogueStore store, ITrackUsage usage, CancellationToken ct)
    {
        var track = await store.FindAsync(id, ct);
        if (track is null || !request.IsDisabled || track.IsDisabled)
            return new DisableAttempt(track, false);

        var usages = await usage.GetAsync([id], ct);
        return new DisableAttempt(track, usages.GetValueOrDefault(id, TrackUsage.None).InTodayChallenge);
    }

    public static ProblemDetails Validate(DisableAttempt attempt) => attempt switch
    {
        { Track: null } => CatalogueProblems.TrackNotFound(),
        { InTodayChallenge: true } => CatalogueProblems.TrackInTodayChallenge(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>PUT /api/admin/catalogue/tracks/{id}/disabled</c> : retire un morceau du tirage des prochains défis (ou l'y
    /// remet), sans le supprimer : c'est l'alternative à la suppression pour un morceau déjà utilisé. Il reste
    /// dans le pool ; les défis déjà générés ne changent pas. Désactiver un morceau du défi du jour : 409
    /// <c>catalogue.track_in_today_challenge</c> (l'admin croirait l'avoir retiré alors qu'il se joue aujourd'hui) ;
    /// la réactivation est toujours permise.
    /// </summary>
    [WolverinePut("/api/admin/catalogue/tracks/{id}/disabled", OperationId = "setTrackDisabled")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static TrackDisabledResponse Put(SetTrackDisabled request, DisableAttempt attempt, TimeProvider time)
    {
        if (request.IsDisabled)
            attempt.Track!.Disable(time.GetUtcNow());
        else
            attempt.Track!.Enable(time.GetUtcNow());
        return new TrackDisabledResponse(attempt.Track.Id, attempt.Track.IsDisabled);
    }
}

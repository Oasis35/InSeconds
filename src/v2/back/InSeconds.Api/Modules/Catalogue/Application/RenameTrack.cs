using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

public sealed record RenameTrack(string Artist, string Title);

public sealed class RenameTrackValidator : AbstractValidator<RenameTrack>
{
    public RenameTrackValidator()
    {
        // Longueurs de la v1 (TrackConfiguration).
        RuleFor(x => x.Artist).Must(a => !string.IsNullOrWhiteSpace(a)).MaximumLength(200);
        RuleFor(x => x.Title).Must(t => !string.IsNullOrWhiteSpace(t)).MaximumLength(300);
    }
}

public static class RenameTrackEndpoint
{
    public static Task<Track?> LoadAsync(int id, ICatalogueStore store, CancellationToken ct) => store.FindAsync(id, ct);

    public static ProblemDetails Validate(Track? track) =>
        track is null ? CatalogueProblems.TrackNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>PATCH /api/admin/catalogue/tracks/{id}</c> : corrige l'artiste et le titre, **à tout moment, défi du
    /// jour compris** (v1 : PR #246, il fallait attendre le lendemain pour corriger une faute). Aucun verrou, pas de
    /// code <c>catalogue.track_locked</c> : les réponses déjà enregistrées gardent leur verdict, les suivantes
    /// sont corrigées avec le nouveau nom, et le nom affiché change pour tout le monde (Daily, E). Le front
    /// avertit dans la modale quand le morceau est dans le défi du jour (<c>inTodayChallenge</c> du pool).
    /// </summary>
    [WolverinePatch("/api/admin/catalogue/tracks/{id}", OperationId = "renameTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static TrackSummary Patch(RenameTrack request, Track track, IOptionsMonitor<CatalogueOptions> options, TimeProvider time)
    {
        track.Rename(request.Artist, request.Title, time.GetUtcNow());
        return TrackMapping.ToSummary(track, options.CurrentValue);
    }
}

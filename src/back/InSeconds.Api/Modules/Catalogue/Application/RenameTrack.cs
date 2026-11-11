using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <param name="AltTitles">Les autres titres acceptés comme bonne réponse : absent, rien ne change ; une liste (5 au plus), elle remplace celle du morceau ; vide, ils sont retirés.</param>
/// <param name="Genre">Le genre saisi à la main : absent, rien ne change ; un texte, il remplace les genres du morceau ; vide, le genre saisi est retiré (ceux de Deezer restent).</param>
public sealed record RenameTrack(string Artist, string Title, string? Genre = null, IReadOnlyList<string>? AltTitles = null);

public sealed class RenameTrackValidator : AbstractValidator<RenameTrack>
{
    public RenameTrackValidator()
    {
        // Longueurs des colonnes artist et title.
        RuleFor(x => x.Artist).Must(a => !string.IsNullOrWhiteSpace(a)).MaximumLength(200);
        RuleFor(x => x.Title).Must(t => !string.IsNullOrWhiteSpace(t)).MaximumLength(300);
        RuleFor(x => x.Genre).MaximumLength(60);
        RuleFor(x => x.AltTitles).Must(l => l is null || l.Count <= Track.MaxAltTitles);
        RuleForEach(x => x.AltTitles).MaximumLength(300);
    }
}

public static class RenameTrackEndpoint
{
    public static Task<Track?> LoadAsync(int id, ICatalogueStore store, CancellationToken ct) => store.FindWithGenresAsync(id, ct);

    public static ProblemDetails Validate(Track? track) =>
        track is null ? CatalogueProblems.TrackNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>PATCH /api/admin/catalogue/tracks/{id}</c> : corrige l'artiste et le titre, **à tout moment, défi du
    /// jour compris** (#246 : une faute se corrige sans attendre le lendemain). Le genre se saisit dans la même fenêtre (<c>Genre</c> : voir <see cref="RenameTrack"/>). Aucun verrou, pas de
    /// code <c>catalogue.track_locked</c> : les réponses déjà enregistrées gardent leur verdict, les suivantes
    /// sont corrigées avec le nouveau nom, et le nom affiché change pour tout le monde (Daily, Runs). Le front
    /// avertit dans la modale quand le morceau est dans le défi du jour (<c>inTodayChallenge</c> du pool).
    /// </summary>
    [WolverinePatch("/api/admin/catalogue/tracks/{id}", OperationId = "renameTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<TrackSummary> Patch(
        RenameTrack request, Track track, ICatalogueStore store, IOptionsMonitor<CatalogueOptions> options, TimeProvider time, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        track.Rename(request.Artist, request.Title, now);
        if (request.AltTitles is not null)
            track.SetAltTitles(request.AltTitles, now);
        if (request.Genre is not null)
        {
            var name = request.Genre.Trim();
            track.SetManualGenre(name.Length == 0 ? null : await store.FindOrAddGenreByNameAsync(name, ct), now);
        }

        return TrackMapping.ToSummary(track, options.CurrentValue);
    }
}

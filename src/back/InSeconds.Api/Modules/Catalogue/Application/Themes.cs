using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

// La liste des thèmes de l'admin : ajout, renommage, suppression d'un thème que plus aucun morceau n'a, et l'association de thèmes de la liste à un
// morceau (plusieurs possibles, jamais de saisie libre sur un morceau).

public sealed record ThemeName(string Name);

public sealed class ThemeNameValidator : AbstractValidator<ThemeName>
{
    public ThemeNameValidator() => RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n)).MaximumLength(Theme.MaxNameLength);
}

public static class ListThemesEndpoint
{
    /// <summary><c>GET /api/admin/catalogue/themes</c> : la liste des thèmes, par nom, avec le nombre de morceaux de chacun.</summary>
    [WolverineGet("/api/admin/catalogue/themes", OperationId = "listThemes")]
    public static Task<IReadOnlyList<ThemeItem>> Get(ICatalogueQueries queries, CancellationToken ct) => queries.ListThemesAsync(ct);
}

/// <summary>Ce que l'ajout d'un thème a trouvé : le nom déjà pris, ou non.</summary>
public sealed record ThemeToAdd(string Name, bool NameTaken);

public static class AddThemeEndpoint
{
    public static async Task<ThemeToAdd> LoadAsync(ThemeName request, ICatalogueStore store, CancellationToken ct) =>
        new(request.Name.Trim(), await store.ThemeNameTakenAsync(request.Name, null, ct));

    public static ProblemDetails Validate(ThemeToAdd plan) =>
        plan.NameTaken ? CatalogueProblems.ThemeNameTaken() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>POST /api/admin/catalogue/themes</c> <c>{ name }</c> : ajoute un thème à la liste. 409 <c>catalogue.theme_name_taken</c> si un thème porte
    /// déjà ce nom (casse ignorée), 400 si le nom est vide ou de plus de 60 caractères.
    /// </summary>
    [WolverinePost("/api/admin/catalogue/themes", OperationId = "addTheme")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<ThemeItem> Post(ThemeName request, [NotBody] ThemeToAdd plan, ICatalogueStore store, TimeProvider time, CancellationToken ct)
    {
        var theme = new Theme(plan.Name, time.GetUtcNow());
        await store.AddThemeAsync(theme, ct);
        return new ThemeItem(theme.Id, theme.Name, 0);
    }
}

/// <summary>Ce que le renommage d'un thème a trouvé.</summary>
public sealed record ThemeRenaming(Theme? Theme, bool NameTaken);

public static class RenameThemeEndpoint
{
    public static async Task<ThemeRenaming> LoadAsync(int id, ThemeName request, ICatalogueStore store, CancellationToken ct)
    {
        var theme = await store.FindThemeAsync(id, ct);
        return new ThemeRenaming(theme, theme is not null && await store.ThemeNameTakenAsync(request.Name, id, ct));
    }

    public static ProblemDetails Validate(ThemeRenaming plan) => plan switch
    {
        { Theme: null } => CatalogueProblems.ThemeNotFound(),
        { NameTaken: true } => CatalogueProblems.ThemeNameTaken(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>PATCH /api/admin/catalogue/themes/{id}</c> <c>{ name }</c> : renomme un thème (les morceaux gardent le lien : ils suivent le nouveau nom ;
    /// une playlist déjà créée garde le nom qu'elle avait). 404, 409 <c>catalogue.theme_name_taken</c>.
    /// </summary>
    [WolverinePatch("/api/admin/catalogue/themes/{id}", OperationId = "renameTheme")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<ThemeItem> Patch(ThemeName request, [NotBody] ThemeRenaming plan, ICatalogueStore store, CancellationToken ct)
    {
        plan.Theme!.Rename(request.Name);
        return new ThemeItem(plan.Theme.Id, plan.Theme.Name, await store.CountThemeTracksAsync(plan.Theme.Id, ct));
    }
}

/// <summary>Ce que la suppression d'un thème a trouvé.</summary>
public sealed record ThemeDeletion(Theme? Theme, bool InUse);

public static class DeleteThemeEndpoint
{
    public static async Task<ThemeDeletion> LoadAsync(int id, ICatalogueStore store, CancellationToken ct)
    {
        var theme = await store.FindThemeAsync(id, ct);
        return new ThemeDeletion(theme, theme is not null && await store.ThemeInUseAsync(id, ct));
    }

    public static ProblemDetails Validate(ThemeDeletion plan) => plan switch
    {
        { Theme: null } => CatalogueProblems.ThemeNotFound(),
        { InUse: true } => CatalogueProblems.ThemeInUse(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary><c>DELETE /api/admin/catalogue/themes/{id}</c> : supprime un thème, 204. 409 <c>catalogue.theme_in_use</c> tant qu'un morceau l'a.</summary>
    [WolverineDelete("/api/admin/catalogue/themes/{id}", OperationId = "deleteTheme")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Delete([NotBody] ThemeDeletion plan, ICatalogueStore store) => store.RemoveTheme(plan.Theme!);
}

/// <param name="Icon">Le nom de l'icône (Lucide, minuscules et tirets), vide ou absent : le thème n'a plus d'icône.</param>
public sealed record ThemeIcon(string? Icon);

public sealed class ThemeIconValidator : AbstractValidator<ThemeIcon>
{
    public ThemeIconValidator() => RuleFor(x => x.Icon).Must(i => string.IsNullOrWhiteSpace(i) || Theme.IsValidIcon(i.Trim())).WithMessage("Nom d'icône invalide.");
}

/// <summary>Le thème dont on change l'icône ; vide s'il n'existe pas.</summary>
public sealed record ThemeIconChange(Theme? Theme);

public static class SetThemeIconEndpoint
{
    public static async Task<ThemeIconChange> LoadAsync(int id, ICatalogueStore store, CancellationToken ct) => new(await store.FindThemeAsync(id, ct));

    public static ProblemDetails Validate(ThemeIconChange change) => change.Theme is null ? CatalogueProblems.ThemeNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>PUT /api/admin/catalogue/themes/{id}/icon</c> <c>{ icon }</c> : donne une icône au thème (une icône Lucide : « clapperboard »), 204 ;
    /// <c>icon</c> vide ou absent : le thème n'en a plus. 404 si le thème n'existe pas, 400 si le nom n'est pas un nom d'icône (minuscules, chiffres,
    /// tirets, 40 caractères au plus).
    /// </summary>
    [WolverinePut("/api/admin/catalogue/themes/{id}/icon", OperationId = "setThemeIcon")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [EmptyResponse]
    public static void Put(ThemeIcon request, [NotBody] ThemeIconChange change) => change.Theme!.SetIcon(request.Icon);
}

/// <param name="ThemeIds">Les thèmes de la liste qu'a le morceau, tous d'un coup (remplace les précédents) ; vide : le morceau n'en a plus.</param>
public sealed record SetTrackThemes(IReadOnlyList<int> ThemeIds);

/// <summary>Le morceau et les thèmes qu'on veut lui associer.</summary>
public sealed record TrackThemesChange(Track? Track, IReadOnlyList<Theme> Themes, bool ThemeMissing);

public static class SetTrackThemesEndpoint
{
    public static async Task<TrackThemesChange> LoadAsync(int id, SetTrackThemes request, ICatalogueStore store, CancellationToken ct)
    {
        var track = await store.FindWithThemesAsync(id, ct);
        if (track is null)
            return new TrackThemesChange(null, [], false);

        var wanted = request.ThemeIds.Distinct().ToList();
        var themes = await store.FindThemesAsync(wanted, ct);
        return new TrackThemesChange(track, themes, themes.Count != wanted.Count);
    }

    public static ProblemDetails Validate(TrackThemesChange change) => change switch
    {
        { Track: null } => CatalogueProblems.TrackNotFound(),
        { ThemeMissing: true } => CatalogueProblems.ThemeNotFound(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>PUT /api/admin/catalogue/tracks/{id}/themes</c> <c>{ themeIds }</c> : donne au morceau ces thèmes de la liste (plusieurs possibles) à la
    /// place de ceux qu'il avait, 204 ; <c>themeIds</c> vide : il n'en a plus. 404 si le morceau ou l'un des thèmes n'existe pas : jamais de saisie libre.
    /// </summary>
    [WolverinePut("/api/admin/catalogue/tracks/{id}/themes", OperationId = "setTrackThemes")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [EmptyResponse]
    public static void Put(SetTrackThemes request, [NotBody] TrackThemesChange change, TimeProvider time) =>
        change.Track!.SetThemes(change.Themes, time.GetUtcNow());
}

/// <summary>Les morceaux à ajouter à un thème.</summary>
public sealed record ThemeAssignment(int ThemeId, IReadOnlyList<int> TrackIds);

/// <param name="Assignments">Un élément par thème (le même thème peut revenir : ses morceaux s'additionnent).</param>
public sealed record AssignTracksToThemes(IReadOnlyList<ThemeAssignment> Assignments);

/// <param name="Added">Les liens créés : un morceau qui avait déjà le thème, ou qui n'existe plus, n'en crée aucun.</param>
public sealed record AssignTracksToThemesResult(int Added);

public sealed class AssignTracksToThemesValidator : AbstractValidator<AssignTracksToThemes>
{
    /// <summary>Un import de tout le pool (850 morceaux) dans une douzaine de thèmes tient largement dedans.</summary>
    public const int MaxLinks = 20_000;

    public AssignTracksToThemesValidator()
    {
        RuleFor(x => x.Assignments).NotEmpty().Must(a => a.Count <= 500);
        RuleFor(x => x.Assignments).Must(a => a.Sum(i => i.TrackIds.Count) <= MaxLinks).WithMessage($"Au plus {MaxLinks} morceaux à la fois.");
        RuleForEach(x => x.Assignments).Must(a => a.TrackIds.Count > 0);
    }
}

/// <summary>Ce que l'ajout en lot a chargé : les thèmes demandés et les morceaux qui existent encore.</summary>
public sealed record ThemeAssignmentPlan(IReadOnlyList<Theme> Themes, IReadOnlyList<Track> Tracks, bool ThemeMissing);

public static class AssignTracksToThemesEndpoint
{
    public static async Task<ThemeAssignmentPlan> LoadAsync(AssignTracksToThemes request, ICatalogueStore store, CancellationToken ct)
    {
        var themeIds = request.Assignments.Select(a => a.ThemeId).Distinct().ToList();
        var themes = await store.FindThemesAsync(themeIds, ct);
        var trackIds = request.Assignments.SelectMany(a => a.TrackIds).Distinct().ToList();
        var tracks = themes.Count == themeIds.Count ? await store.FindManyWithThemesAsync(trackIds, ct) : [];
        return new ThemeAssignmentPlan(themes, tracks, themes.Count != themeIds.Count);
    }

    public static ProblemDetails Validate(ThemeAssignmentPlan plan) =>
        plan.ThemeMissing ? CatalogueProblems.ThemeNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>POST /api/admin/catalogue/themes/assignments</c> <c>{ assignments: [{ themeId, trackIds }] }</c> : **ajoute** ces morceaux à ces thèmes, sans
    /// rien retirer (contrairement à <c>PUT /tracks/{id}/themes</c>, qui remplace). Sert l'import d'un classement et l'ajout en lot par filtre de
    /// l'onglet Thèmes. Un morceau qui a déjà le thème ou qui n'existe plus est ignoré. 404 si un thème n'existe pas (rien n'est écrit), 400 si la
    /// demande est vide ou démesurée.
    /// </summary>
    [WolverinePost("/api/admin/catalogue/themes/assignments", OperationId = "assignTracksToThemes")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static AssignTracksToThemesResult Post(AssignTracksToThemes request, [NotBody] ThemeAssignmentPlan plan, TimeProvider time)
    {
        var now = time.GetUtcNow();
        var themesById = plan.Themes.ToDictionary(t => t.Id);
        var tracksById = plan.Tracks.ToDictionary(t => t.Id);
        var added = 0;
        foreach (var assignment in request.Assignments)
        {
            var theme = themesById[assignment.ThemeId];
            foreach (var trackId in assignment.TrackIds.Distinct())
            {
                if (tracksById.TryGetValue(trackId, out var track))
                    added += track.AddThemes([theme], now);
            }
        }

        return new AssignTracksToThemesResult(added);
    }
}

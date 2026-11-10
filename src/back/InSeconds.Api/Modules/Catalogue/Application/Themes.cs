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

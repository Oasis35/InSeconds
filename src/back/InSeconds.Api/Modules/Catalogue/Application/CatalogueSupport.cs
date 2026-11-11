using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Codes d'erreur du module Catalogue. Ne jamais renommer un code publié.</summary>
public static class CatalogueErrorCodes
{
    public const string TrackInUse = "catalogue.track_in_use";
    public const string TrackInTodayChallenge = "catalogue.track_in_today_challenge";
    public const string DuplicateDeezerId = "catalogue.duplicate_deezer_id";
    public const string ConcurrentAdd = "catalogue.concurrent_add";
    public const string NotFoundOnDeezer = "catalogue.not_found_on_deezer";
    public const string DeezerUnavailable = "catalogue.deezer_unavailable";
    public const string ThemeNotFound = "catalogue.theme_not_found";
    public const string ThemeNameTaken = "catalogue.theme_name_taken";
    public const string ThemeInUse = "catalogue.theme_in_use";
    public const string CandidateNotFound = "catalogue.candidate_not_found";
    public const string CandidatePreviewMissing = "catalogue.candidate_preview_missing";
}

internal static class CatalogueProblems
{
    public static ProblemDetails TrackNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Morceau introuvable.");

    public static ProblemDetails ThemeNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, CatalogueErrorCodes.ThemeNotFound, "Thème introuvable.");

    public static ProblemDetails CandidateNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, CatalogueErrorCodes.CandidateNotFound, "Candidat introuvable.");

    /// <summary>Le morceau est lu mais Deezer n'a pas d'extrait : rien à écouter, 422 (la demande est bien formée).</summary>
    public static ProblemDetails CandidatePreviewMissing() =>
        ApiProblem.Of(StatusCodes.Status422UnprocessableEntity, CatalogueErrorCodes.CandidatePreviewMissing, "Deezer n'a pas d'extrait pour ce morceau.");

    public static ProblemDetails ThemeNameTaken() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.ThemeNameTaken, "Un thème porte déjà ce nom.");

    public static ProblemDetails ThemeInUse() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.ThemeInUse, "Des morceaux ont ce thème : retire-le d'abord de chacun.");

    public static ProblemDetails TrackInUse(string action) =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.TrackInUse, $"Ce morceau est utilisé dans un défi et ne peut pas être {action}.");

    public static ProblemDetails TrackInTodayChallenge() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.TrackInTodayChallenge, "Ce morceau est dans le défi du jour : désactivable à partir de demain.");

    public static ProblemDetails ConcurrentAdd() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.ConcurrentAdd, "Un autre ajout écrit les mêmes genres : réessaie.");

    public static ProblemDetails DuplicateDeezerId() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.DuplicateDeezerId, "Un morceau du pool a déjà cet identifiant Deezer.");

    /// <summary>Un identifiant que Deezer ne connaît pas : 422 (la requête est bien formée, son contenu inexploitable).</summary>
    public static ProblemDetails NotFoundOnDeezer() =>
        ApiProblem.Of(StatusCodes.Status422UnprocessableEntity, CatalogueErrorCodes.NotFoundOnDeezer, "Ce morceau est introuvable chez Deezer.");

    public static ProblemDetails DeezerUnavailable() =>
        ApiProblem.Of(StatusCodes.Status503ServiceUnavailable, CatalogueErrorCodes.DeezerUnavailable, "Deezer est momentanément indisponible, réessaie.");
}

/// <summary>Réglages du module, relus à chaud depuis <c>infra.settings</c>.</summary>
public sealed class CatalogueOptions
{
    public const string Section = "Catalogue";

    /// <summary>Format Deezer : la pochette se reconstruit depuis le hash stocké (<c>cover_hash</c>).</summary>
    public string CoverUrlTemplate { get; set; } = "https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg";

    public string? CoverUrl(string? coverHash) =>
        string.IsNullOrEmpty(coverHash) ? null : CoverUrlTemplate.Replace("{hash}", coverHash, StringComparison.Ordinal);
}

/// <summary>
/// Cadence du contrôle des extraits : Deezer limite à ~50 requêtes / 5 s, des lots de 10 espacés de 1,5 s font
/// ~33 requêtes / 5 s au plus. Réglable pour que les tests n'attendent pas.
/// </summary>
public sealed class RefreshOptions
{
    public const string Section = "Catalogue:Refresh";

    public int BatchSize { get; set; } = 10;

    public TimeSpan BatchDelay { get; set; } = TimeSpan.FromSeconds(1.5);
}

/// <summary>Un morceau, dans les réponses qui suivent son ajout, son renommage ou son actualisation.</summary>
/// <param name="PreviewStatus"><c>unknown</c>, <c>available</c> ou <c>missing</c>.</param>
public sealed record TrackSummary(
    int Id, long DeezerTrackId, string Artist, string Title, string? CoverUrl, int? ReleaseYear, int? Rank, string PreviewStatus, bool IsDisabled, IReadOnlyList<string>? AltTitles = null);

/// <summary>Une ligne du pool admin : le morceau et ce que chaque mode de jeu en a fait.</summary>
/// <param name="PreviewStatus"><c>unknown</c>, <c>available</c> ou <c>missing</c>.</param>
/// <param name="IsUsed">Un mode au moins l'a joué (ou le déclare utilisé) : ni suppression ni actualisation (409 <c>catalogue.track_in_use</c>).</param>
/// <param name="Usages">Un élément par mode qui a quelque chose à dire du morceau, dans l'ordre d'enregistrement des modes.</param>
/// <param name="Genres">Les genres de l'album du morceau (noms), vides tant qu'ils ne sont pas lus ou si l'album n'en a pas.</param>
/// <param name="ThemeIds">Les thèmes de la liste de l'admin associés au morceau (plusieurs possibles), vides : aucun.</param>
public sealed record TrackListItem(
    int Id, long DeezerTrackId, string Artist, string Title, string? CoverUrl, int? ReleaseYear, int? Rank,
    string PreviewStatus, DateTimeOffset? PreviewCheckedAt, bool IsDisabled, bool IsUsed, IReadOnlyList<TrackModeUsage> Usages,
    IReadOnlyList<string> Genres, IReadOnlyList<int>? ThemeIds = null, IReadOnlyList<string>? AltTitles = null);

/// <summary>L'usage d'un morceau par un mode.</summary>
/// <param name="Mode">Nom stable du mode (<c>daily</c>).</param>
/// <param name="InTodayChallenge">Morceau du défi du jour : non désactivable avant demain, le renommer est permis (avertissement côté front).</param>
/// <param name="AnswerCount">Réponses données sur ce morceau dans ce mode.</param>
/// <param name="FoundCount">Parmi elles, celles qui ont trouvé l'artiste ou le titre.</param>
public sealed record TrackModeUsage(
    string Mode, int UsageCount, DateOnly? LastUsedDate, DateOnly? UnlockDate, bool InTodayChallenge, int AnswerCount, int FoundCount);

internal static class TrackMapping
{
    public static string Name(PreviewStatus status) => status switch
    {
        PreviewStatus.Available => "available",
        PreviewStatus.Missing => "missing",
        _ => "unknown",
    };

    public static TrackSummary ToSummary(Track track, CatalogueOptions options) => new(
        track.Id, track.DeezerTrackId, track.Artist, track.Title, options.CoverUrl(track.CoverHash),
        track.ReleaseYear, track.DeezerRank, Name(track.PreviewStatus), track.IsDisabled, track.AltTitles);

    /// <summary>L'état de l'extrait et l'identité d'un morceau lus chez Deezer, tels que le pool les garde.</summary>
    public static TrackMetadata ToMetadata(DeezerTrack track) => new(
        track.DeezerTrackId, track.Artist, track.Title, track.CoverHash, ToYear(track.ReleaseYear), track.Rank,
        string.IsNullOrEmpty(track.PreviewUrl) ? PreviewStatus.Missing : PreviewStatus.Available, track.AlbumId);

    /// <summary>
    /// Les genres de l'album lu à l'ajout ou à l'actualisation d'un morceau. Album supprimé chez Deezer : sans genre, et inutile de le
    /// redemander. Album non lu ou Deezer indisponible : rien ne change, le contrôle nocturne rattrape.
    /// </summary>
    public static async Task RecordAlbumGenresAsync(Track track, AlbumLookup? album, ICatalogueStore store, DateTimeOffset now, CancellationToken ct)
    {
        switch (album)
        {
            case AlbumLookup.Found found:
                track.RecordGenres(await store.EnsureGenresAsync([.. found.Genres.Select(g => new GenreRef(g.Id, g.Name))], ct), now);
                break;
            case AlbumLookup.NotFound:
                track.RecordGenres([], now);
                break;
        }
    }

    // La colonne est un smallint : une année absurde est ignorée plutôt que de faire échouer l'ajout.
    private static short? ToYear(int? year) => year is >= 1 and <= short.MaxValue ? (short)year.Value : null;
}

/// <summary>Lectures du module Catalogue, en projections directes.</summary>
public interface ICatalogueQueries
{
    /// <summary>Tous les morceaux du pool, par artiste puis titre.</summary>
    Task<IReadOnlyList<TrackRow>> ListTracksAsync(CancellationToken ct);

    /// <summary>Les thèmes de l'admin, par nom, chacun avec le nombre de morceaux qui l'ont.</summary>
    Task<IReadOnlyList<ThemeItem>> ListThemesAsync(CancellationToken ct);

    /// <summary>Les candidats du sas (écartés compris), dans l'ordre d'import, chacun avec son état : déjà au pool ou non.</summary>
    Task<IReadOnlyList<CandidateItem>> ListCandidatesAsync(CancellationToken ct);

    /// <summary>Les morceaux actifs sans extrait chez Deezer, et ceux qui ont un extrait mais pas encore de forme d'onde.</summary>
    Task<CatalogueHealthResponse> GetHealthAsync(CancellationToken ct);
}

/// <summary>Un candidat du sas, tel que l'écran de l'admin le montre.</summary>
/// <param name="Priority">« A », « B » ou « C » si l'import en donnait une, vide sinon.</param>
/// <param name="Status"><c>pending</c> (pas encore lu chez Deezer), <c>ready</c> ou <c>not_found</c>.</param>
/// <param name="PreviewStatus"><c>unknown</c>, <c>available</c> ou <c>missing</c> (seulement une fois lu).</param>
/// <param name="InCatalogue">Un morceau du pool a déjà cet identifiant Deezer (ajouté depuis par un autre chemin).</param>
/// <param name="IsAdding">L'ajout au pool est demandé et pas encore fait.</param>
public sealed record CandidateItem(
    int Id, long DeezerTrackId, string? Priority, string Status, string? Artist, string? Title, int? ReleaseYear, int? Rank, string PreviewStatus,
    bool InCatalogue, bool IsDismissed, bool IsAdding);

/// <summary>Un thème de la liste de l'admin.</summary>
/// <param name="TrackCount">Les morceaux du pool qui ont ce thème (désactivés compris) ; la suppression n'est permise qu'à zéro.</param>
/// <param name="Icon">Le nom de l'icône du thème (Lucide), vide : aucune.</param>
public sealed record ThemeItem(int Id, string Name, int TrackCount, string? Icon = null);

/// <summary>Un morceau tel que la base le lit, avant d'y joindre son usage.</summary>
public sealed record TrackRow(
    int Id, long DeezerTrackId, string Artist, string Title, string? CoverHash, short? ReleaseYear, int? DeezerRank,
    PreviewStatus PreviewStatus, DateTimeOffset? PreviewCheckedAt, bool IsDisabled, IReadOnlyList<string> Genres, IReadOnlyList<int>? ThemeIds = null,
    IReadOnlyList<string>? AltTitles = null);

/// <summary>
/// Le calcul de la forme des extraits (<c>InSeconds.Waveform</c>), réglé comme le reste à chaud (<c>infra.settings</c>).
/// </summary>
public sealed class WaveformOptions
{
    public const string Section = "Catalogue:Waveform";

    /// <summary>
    /// Calculer les formes après l'ajout d'un morceau (message différé de <see cref="DelayMinutes"/>). <c>false</c> au staging : même IP que la prod,
    /// même quota Deezer (piège 16), et la copie de la prod apporte déjà les formes.
    /// </summary>
    public bool ComputeOnAdd { get; set; } = true;

    /// <summary>
    /// Attente après le dernier ajout avant de calculer : plusieurs ajouts d'affilée donnent un seul passage, qui prend tous les morceaux sans forme.
    /// </summary>
    public int DelayMinutes { get; set; } = 15;
}

/// <summary>Journal du module. EventId 12xx (Deezer : 1210 à 1221).</summary>
internal static partial class CatalogueLog
{
    [LoggerMessage(EventId = 1200, Level = LogLevel.Information,
        Message = "Contrôle des previews : aucun morceau à vérifier.")]
    public static partial void NothingToRefresh(ILogger logger);

    [LoggerMessage(EventId = 1202, Level = LogLevel.Information,
        Message = "Genres des albums : {Albums} album(s) lu(s), {Failed} échec(s) Deezer (rattrapés à la prochaine exécution).")]
    public static partial void GenresRefreshed(ILogger logger, int albums, int failed);

    [LoggerMessage(EventId = 1201, Level = LogLevel.Information,
        Message = "Contrôle des previews terminé : {CheckedCount} morceaux vérifiés, {Updated} état(s) de preview changé(s), {Failed} échec(s) Deezer (états conservés).")]
    public static partial void RefreshCompleted(ILogger logger, int checkedCount, int updated, int failed);

    // Jamais le titre ni l'adresse de l'extrait (signée, piège 14) : l'identifiant du morceau suffit.
    [LoggerMessage(EventId = 1203, Level = LogLevel.Warning,
        Message = "Morceau {TrackId} envoyé sans forme d'onde : le navigateur la calcule lui-même (ajout récent, calcul en échec ou remplissage pas encore fait).")]
    public static partial void TrackWithoutWaveform(ILogger logger, int trackId);

    [LoggerMessage(EventId = 1204, Level = LogLevel.Information,
        Message = "Formes d'onde : {Computed} calculée(s), {Failed} en échec, {Unavailable} sans extrait lisible, en {ElapsedMs} ms.")]
    public static partial void WaveformsComputed(ILogger logger, int computed, int failed, int unavailable, long elapsedMs);

    [LoggerMessage(EventId = 1205, Level = LogLevel.Warning,
        Message = "Forme d'onde du morceau {TrackId} non calculée : {Reason}.")]
    public static partial void WaveformFailed(ILogger logger, int trackId, string reason);

    [LoggerMessage(EventId = 1206, Level = LogLevel.Information,
        Message = "Formes d'onde reportées de {DelayMinutes} min : {Reason}.")]
    public static partial void WaveformsDeferred(ILogger logger, int delayMinutes, string reason);

    [LoggerMessage(EventId = 1207, Level = LogLevel.Warning,
        Message = "Formes d'onde du contrôle nocturne sautées : le calcul d'un ajout n'a pas fini en {WaitMinutes} min.")]
    public static partial void WaveformsSkippedBusy(ILogger logger, int waitMinutes);

    [LoggerMessage(EventId = 1208, Level = LogLevel.Information,
        Message = "Candidats lus chez Deezer : {Read} lu(s), {NotFound} introuvable(s), {Unavailable} à relire (Deezer n'a pas répondu).")]
    public static partial void CandidatesRead(ILogger logger, int read, int notFound, int unavailable);

    [LoggerMessage(EventId = 1209, Level = LogLevel.Information,
        Message = "Candidats ajoutés au pool : {Added} ajouté(s), {Gone} retiré(s) du sas sans ajout (déjà au pool).")]
    public static partial void CandidatesAdded(ILogger logger, int added, int gone);
}

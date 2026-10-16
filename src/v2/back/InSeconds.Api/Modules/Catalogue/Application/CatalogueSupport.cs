using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Codes d'erreur du module Catalogue (§ 5.6 du plan v2). Ne jamais renommer un code publié.</summary>
public static class CatalogueErrorCodes
{
    public const string TrackInUse = "catalogue.track_in_use";
    public const string TrackInTodayChallenge = "catalogue.track_in_today_challenge";
    public const string DuplicateDeezerId = "catalogue.duplicate_deezer_id";
    public const string NotFoundOnDeezer = "catalogue.not_found_on_deezer";
    public const string DeezerUnavailable = "catalogue.deezer_unavailable";
}

internal static class CatalogueProblems
{
    public static ProblemDetails TrackNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Morceau introuvable.");

    public static ProblemDetails TrackInUse(string action) =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.TrackInUse, $"Ce morceau est utilisé dans un défi et ne peut pas être {action}.");

    public static ProblemDetails TrackInTodayChallenge() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.TrackInTodayChallenge, "Ce morceau est dans le défi du jour : désactivable à partir de demain.");

    public static ProblemDetails DuplicateDeezerId() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, CatalogueErrorCodes.DuplicateDeezerId, "Un morceau du pool a déjà cet identifiant Deezer.");

    /// <summary>Un identifiant que Deezer ne connaît pas : comme en v1, 422 (la requête est bien formée, son contenu inexploitable).</summary>
    public static ProblemDetails NotFoundOnDeezer() =>
        ApiProblem.Of(StatusCodes.Status422UnprocessableEntity, CatalogueErrorCodes.NotFoundOnDeezer, "Ce morceau est introuvable chez Deezer.");

    public static ProblemDetails DeezerUnavailable() =>
        ApiProblem.Of(StatusCodes.Status503ServiceUnavailable, CatalogueErrorCodes.DeezerUnavailable, "Deezer est momentanément indisponible, réessaie.");
}

/// <summary>Réglages du module, relus à chaud depuis <c>infra.settings</c> (§ 4.6 du plan v2).</summary>
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
    int Id, long DeezerTrackId, string Artist, string Title, string? CoverUrl, int? ReleaseYear, int? Rank, string PreviewStatus, bool IsDisabled);

/// <summary>Une ligne du pool admin : le morceau et ce que le jeu en a fait.</summary>
/// <param name="PreviewStatus"><c>unknown</c>, <c>available</c> ou <c>missing</c>.</param>
/// <param name="InTodayChallenge">Morceau du défi du jour : non désactivable avant demain, le renommer est permis (avertissement côté front).</param>
public sealed record TrackListItem(
    int Id, long DeezerTrackId, string Artist, string Title, string? CoverUrl, int? ReleaseYear, int? Rank,
    string PreviewStatus, DateTimeOffset? PreviewCheckedAt, bool IsDisabled,
    DateOnly? LastUsedDate, int UsageCount, DateOnly? UnlockDate, bool InTodayChallenge);

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
        track.ReleaseYear, track.DeezerRank, Name(track.PreviewStatus), track.IsDisabled);

    /// <summary>L'état de l'extrait et l'identité d'un morceau lus chez Deezer, tels que le pool les garde.</summary>
    public static TrackMetadata ToMetadata(InSeconds.Deezer.DeezerTrack track) => new(
        track.DeezerTrackId, track.Artist, track.Title, track.CoverHash, ToYear(track.ReleaseYear), track.Rank,
        string.IsNullOrEmpty(track.PreviewUrl) ? PreviewStatus.Missing : PreviewStatus.Available);

    // La colonne est un smallint : une année absurde est ignorée plutôt que de faire échouer l'ajout.
    private static short? ToYear(int? year) => year is >= 1 and <= short.MaxValue ? (short)year.Value : null;
}

/// <summary>Lectures du module Catalogue, en projections directes.</summary>
public interface ICatalogueQueries
{
    /// <summary>Tous les morceaux du pool, par artiste puis titre.</summary>
    Task<IReadOnlyList<TrackRow>> ListTracksAsync(CancellationToken ct);
}

/// <summary>Un morceau tel que la base le lit, avant d'y joindre son usage.</summary>
public sealed record TrackRow(
    int Id, long DeezerTrackId, string Artist, string Title, string? CoverHash, short? ReleaseYear, int? DeezerRank,
    PreviewStatus PreviewStatus, DateTimeOffset? PreviewCheckedAt, bool IsDisabled);

/// <summary>Journal du module. EventId 12xx (Deezer : 1210 à 1214).</summary>
internal static partial class CatalogueLog
{
    [LoggerMessage(EventId = 1200, Level = LogLevel.Information,
        Message = "Contrôle des previews : aucun morceau à vérifier.")]
    public static partial void NothingToRefresh(ILogger logger);

    [LoggerMessage(EventId = 1201, Level = LogLevel.Information,
        Message = "Contrôle des previews terminé : {CheckedCount} morceaux vérifiés, {Updated} état(s) de preview changé(s), {Failed} échec(s) Deezer (états conservés).")]
    public static partial void RefreshCompleted(ILogger logger, int checkedCount, int updated, int failed);
}

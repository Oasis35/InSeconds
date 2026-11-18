using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Social.Application;

/// <summary>
/// Le classement général calculé, gardé **une minute** pour tous les joueurs (il se calcule sur tous les comptes classés). Un changement de nom
/// l'efface tout de suite : le joueur se voit sous son nouveau nom dès la lecture suivante. Un singleton propre, pas l'<c>IMemoryCache</c> partagé
/// (piège 24).
/// </summary>
public sealed class GeneralRankingCache(TimeProvider time)
{
    public static readonly TimeSpan Duration = TimeSpan.FromMinutes(1);

    private readonly Lock _lock = new();
    private (IReadOnlyList<RankingRow> Rows, DateTimeOffset At)? _entry;

    public async Task<IReadOnlyList<RankingRow>> GetAsync(Func<Task<IReadOnlyList<RankingRow>>> load)
    {
        ArgumentNullException.ThrowIfNull(load);
        lock (_lock)
        {
            if (_entry is { } entry && time.GetUtcNow() - entry.At < Duration)
                return entry.Rows;
        }

        var rows = await load();
        lock (_lock)
            _entry = (rows, time.GetUtcNow());
        return rows;
    }

    public void Invalidate()
    {
        lock (_lock)
            _entry = null;
    }
}

/// <summary>Le nom sous lequel le joueur apparaît au classement général.</summary>
/// <param name="Mode"><c>pseudo</c> (le défaut) ou <c>alias</c>.</param>
/// <param name="Name">Le nom affiché : son pseudo, ou son alias.</param>
/// <param name="Alias">Son alias musical ; vide en mode pseudo.</param>
public sealed record RankingIdentityResponse(string Mode, string Name, string? Alias);

public static class GetGeneralRankingEndpoint
{
    /// <summary>
    /// <c>GET /api/social/ranking</c> : le classement général, pour tout joueur identifié : les comptes qui ont l'accès à un mode et y ont fini une
    /// partie, sous leur pseudo ou leur alias musical ; les 20 premiers, puis le joueur et ses deux voisins. Gardé une minute. Pour un compte, le nom
    /// sous lequel il apparaît (« Tu apparais sous Léa ») ; rien pour un invité, qui n'y figure jamais.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/ranking", OperationId = "getGeneralRanking")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<GeneralRankingResponse> Get(
        ICurrentPlayer current, ISocialQueries queries, GroupRanking ranking, GeneralRankingCache cache, IPlayerDirectory players, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var rows = await cache.GetAsync(async () =>
        {
            var ids = await ranking.ListGeneralRankingPlayersAsync(ct);
            var ranked = await ranking.RankAsync(ids, ct);
            var aliases = await queries.GetAliasesAsync(ids, ct);
            // Le nom public : l'alias s'il en a un, sinon son pseudo.
            return [.. ranked.Select(r => aliases.TryGetValue(r.PlayerId, out var alias) ? r with { Pseudo = alias } : r)];
        });
        var view = GeneralRankingPolicy.Build(rows, playerId);
        var hasAccount = await players.HasAccountAsync(playerId, ct);
        return new GeneralRankingResponse(
            [.. view.Top.Select(r => EntryOf(r, playerId))], [.. view.Around.Select(r => EntryOf(r, playerId))], view.Total, hasAccount,
            hasAccount ? await RankingIdentities.OfAsync(playerId, queries, players, ct) : null);
    }

    // Ni parties jouées, ni record, ni performance : au général, le rang, le nom, le disque et les points suffisent, et ces valeurs en plus
    // aideraient à relier un alias au pseudo que voient les membres d'un groupe.
    private static RankingEntryResponse EntryOf(RankingRow row, Guid playerId) =>
        new(row.Rank, row.Pseudo, row.PlayerId == playerId, null, 0, null, row.Points, row.Badge);
}

/// <summary>Le nom d'un joueur au classement général, et le tirage d'un alias libre.</summary>
internal static class RankingIdentities
{
    public const string Pseudo = "pseudo";
    public const string Alias = "alias";

    /// <summary>Tirages de 10 alias, d'abord à 2 chiffres, puis à 3 si les listes saturent.</summary>
    private static readonly int[] DigitsPerRound = [2, 2, 2, 3, 3, 3];

    public static async Task<RankingIdentityResponse> OfAsync(Guid playerId, ISocialQueries queries, IPlayerDirectory players, CancellationToken ct)
    {
        var aliases = await queries.GetAliasesAsync([playerId], ct);
        if (aliases.TryGetValue(playerId, out var alias))
            return new RankingIdentityResponse(Alias, alias, alias);
        var pseudos = await players.GetPseudosAsync([playerId], ct);
        return new RankingIdentityResponse(Pseudo, pseudos.GetValueOrDefault(playerId, ""), null);
    }

    /// <summary>
    /// Un alias libre : ni l'alias d'un joueur, ni le pseudo d'un compte, ni <paramref name="current"/> (« Autre alias » en donne un autre). Sous le
    /// verrou des tirages (deux joueurs qui tirent ensemble se suivent) ; l'index unique reste le dernier filet (409 <c>social.alias_taken</c>).
    /// </summary>
    public static async Task<string> DrawFreeAliasAsync(IRankingIdentityStore store, IPlayerDirectory players, string? current, CancellationToken ct)
    {
        await store.LockAliasDrawAsync(ct);
        foreach (var digits in DigitsPerRound)
        {
            foreach (var candidate in MusicalAlias.Draw(Random.Shared.Next, 10, digits))
            {
                if (string.Equals(candidate, current, StringComparison.OrdinalIgnoreCase))
                    continue;
                if (!await store.IsAliasTakenAsync(candidate, ct) && !await players.IsPseudoTakenAsync(candidate, ct))
                    return candidate;
            }
        }

        throw new InvalidOperationException("Aucun alias libre après plusieurs tirages : agrandir les listes.");
    }
}

/// <summary>Le corps du choix : <c>pseudo</c> ou <c>alias</c>.</summary>
public sealed record SetRankingIdentity(string Mode);

/// <summary>Ce que le choix a trouvé : le compte du joueur et son alias actuel.</summary>
public sealed record RankingIdentityChoice(Guid PlayerId, bool HasAccount, RankingIdentity? Current);

internal static class RankingIdentityChoices
{
    public static async Task<RankingIdentityChoice> LoadAsync(
        ICurrentPlayer current, IPlayerDirectory players, IRankingIdentityStore store, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        return new RankingIdentityChoice(playerId, await players.HasAccountAsync(playerId, ct), await store.FindAsync(playerId, ct));
    }
}

public static class SetRankingIdentityEndpoint
{
    public static Task<RankingIdentityChoice> LoadAsync(
        ICurrentPlayer current, IPlayerDirectory players, IRankingIdentityStore store, CancellationToken ct) =>
        RankingIdentityChoices.LoadAsync(current, players, store, ct);

    public static ProblemDetails Validate(SetRankingIdentity request, RankingIdentityChoice choice)
    {
        if (!choice.HasAccount)
            return SocialProblems.AccountRequired();
        return request.Mode is RankingIdentities.Pseudo or RankingIdentities.Alias
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, SocialErrorCodes.InvalidRankingMode, "Le mode est « pseudo » ou « alias ».");
    }

    /// <summary>
    /// <c>PUT /api/social/ranking/identity</c> : apparaître au classement général sous son pseudo (le défaut ; l'alias est rendu, il redevient libre)
    /// ou sous un alias musical (tiré s'il n'en a pas, gardé sinon). Rend le nom choisi. Réservé à un compte : 403 <c>social.account_required</c> ;
    /// 400 <c>social.invalid_ranking_mode</c> ; 409 <c>social.alias_taken</c> si deux tirages se croisent ; 429 au-delà de 20 écritures en 10 minutes.
    /// </summary>
    [Authorize]
    [WolverinePut("/api/social/ranking/identity", OperationId = "setRankingIdentity")]
    [EnableRateLimiting(RateLimitPolicies.SocialWrite)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<RankingIdentityResponse> Put(
        SetRankingIdentity request, [NotBody] RankingIdentityChoice choice, IRankingIdentityStore store, IPlayerDirectory players,
        GeneralRankingCache cache, SocialMetrics metrics, TimeProvider time, ILogger<RankingIdentity> logger, HttpContext http, CancellationToken ct)
    {
        if (request.Mode == RankingIdentities.Pseudo)
        {
            if (choice.Current is { } identity)
            {
                store.Remove(identity);
                Changed(choice.PlayerId, SocialMetrics.ModePseudo, cache, metrics, logger, http);
            }

            var pseudos = await players.GetPseudosAsync([choice.PlayerId], ct);
            return new RankingIdentityResponse(RankingIdentities.Pseudo, pseudos.GetValueOrDefault(choice.PlayerId, ""), null);
        }

        if (choice.Current is { } kept)
            return new RankingIdentityResponse(RankingIdentities.Alias, kept.Alias, kept.Alias);
        var alias = await RankingIdentities.DrawFreeAliasAsync(store, players, null, ct);
        store.Add(new RankingIdentity(choice.PlayerId, alias, time.GetUtcNow()));
        Changed(choice.PlayerId, SocialMetrics.ModeAlias, cache, metrics, logger, http);
        return new RankingIdentityResponse(RankingIdentities.Alias, alias, alias);
    }

    /// <summary>
    /// Le classement gardé est vidé tout de suite **et** au démarrage de la réponse, donc après le commit de Wolverine : une lecture qui se glisse avant
    /// le commit ne garde pas l'ancien nom une minute.
    /// </summary>
    internal static void Changed(Guid playerId, string mode, GeneralRankingCache cache, SocialMetrics metrics, ILogger logger, HttpContext http)
    {
        cache.Invalidate();
        http.Response.OnStarting(() =>
        {
            cache.Invalidate();
            return Task.CompletedTask;
        });
        SocialLog.RankingIdentityChanged(logger, playerId, mode);
        metrics.RankingIdentityChanged(mode);
    }
}

public static class DrawRankingAliasEndpoint
{
    public static Task<RankingIdentityChoice> LoadAsync(
        ICurrentPlayer current, IPlayerDirectory players, IRankingIdentityStore store, CancellationToken ct) =>
        RankingIdentityChoices.LoadAsync(current, players, store, ct);

    public static ProblemDetails Validate(RankingIdentityChoice choice) =>
        choice.HasAccount ? WolverineContinue.NoProblems : SocialProblems.AccountRequired();

    /// <summary>
    /// <c>POST /api/social/ranking/identity/alias</c> : « Autre alias » : tire un nouvel alias libre (différent de l'actuel) et apparaît sous lui ;
    /// l'ancien redevient libre. Mêmes refus que le choix du mode.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/social/ranking/identity/alias", OperationId = "drawRankingAlias")]
    [EnableRateLimiting(RateLimitPolicies.SocialWrite)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<RankingIdentityResponse> Post(
        [NotBody] RankingIdentityChoice choice, IRankingIdentityStore store, IPlayerDirectory players, GeneralRankingCache cache, SocialMetrics metrics,
        TimeProvider time, ILogger<RankingIdentity> logger, HttpContext http, CancellationToken ct)
    {
        var alias = await RankingIdentities.DrawFreeAliasAsync(store, players, choice.Current?.Alias, ct);
        if (choice.Current is { } identity)
            identity.ChangeAlias(alias, time.GetUtcNow());
        else
            store.Add(new RankingIdentity(choice.PlayerId, alias, time.GetUtcNow()));
        // « Autre alias » seulement s'il en avait déjà un ; sinon, c'est son premier alias.
        var mode = choice.Current is null ? SocialMetrics.ModeAlias : SocialMetrics.ModeOtherAlias;
        SetRankingIdentityEndpoint.Changed(choice.PlayerId, mode, cache, metrics, logger, http);
        return new RankingIdentityResponse(RankingIdentities.Alias, alias, alias);
    }
}

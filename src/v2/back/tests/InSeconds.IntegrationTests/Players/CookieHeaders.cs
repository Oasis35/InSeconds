using System.Security.Claims;
using InSeconds.Api.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace InSeconds.IntegrationTests.Players;

/// <summary>Lecture des en-têtes <c>Set-Cookie</c> d'une réponse.</summary>
internal static class CookieHeaders
{
    public static IReadOnlyList<string> All(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values) ? [.. values] : [];

    /// <summary>L'en-tête complet qui pose ou supprime ce cookie, s'il y en a un.</summary>
    public static string? Find(HttpResponseMessage response, string name) =>
        All(response).FirstOrDefault(c => c.StartsWith(name + "=", StringComparison.Ordinal));

    /// <summary>« nom=valeur », à renvoyer dans un en-tête <c>Cookie</c>.</summary>
    public static string Pair(HttpResponseMessage response, string name) =>
        (Find(response, name) ?? throw new InvalidOperationException($"Pas de cookie {name} dans la réponse.")).Split(';')[0];

    /// <summary>Le ticket (déchiffré) du cookie d'authentification posé par la réponse.</summary>
    public static ClaimsPrincipal Ticket(IServiceProvider services, HttpResponseMessage response, string name)
    {
        var format = services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(AuthSetup.Scheme).TicketDataFormat;
        var value = Pair(response, name).Split('=', 2)[1];
        return (format.Unprotect(value) ?? throw new InvalidOperationException($"Cookie {name} illisible.")).Principal;
    }

    /// <summary>Vrai si la réponse supprime ce cookie (date d'expiration passée).</summary>
    public static bool Deletes(HttpResponseMessage response, string name) =>
        Find(response, name) is { } header && header.Contains("expires=Thu, 01 Jan 1970", StringComparison.OrdinalIgnoreCase);
}

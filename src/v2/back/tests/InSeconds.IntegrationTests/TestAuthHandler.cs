using System.Security.Claims;
using System.Text.Encodings.Web;
using InSeconds.Api.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InSeconds.IntegrationTests;

/// <summary>Joueur simulé par les tests, en attendant la vraie connexion (PR B1).</summary>
public sealed record TestUser(string PlayerId, bool IsAdmin)
{
    public static readonly TestUser Player = new("player-1", IsAdmin: false);
    public static readonly TestUser Admin = new("admin-1", IsAdmin: true);

    internal void Apply(HttpClient client)
    {
        client.DefaultRequestHeaders.Add(TestAuthHandler.PlayerHeader, PlayerId);
        if (IsAdmin)
            client.DefaultRequestHeaders.Add(TestAuthHandler.AdminHeader, "true");
    }
}

/// <summary>
/// Authentifie la requête d'après deux en-têtes de test. Seule l'authentification est remplacée :
/// le refus (401 sans joueur, 403 sans le rôle) reste celui du cookie de l'API.
/// </summary>
public sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string PlayerHeader = "X-Test-Player";
    public const string AdminHeader = "X-Test-Admin";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(PlayerHeader, out var playerId))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, playerId.ToString()) };
        if (Request.Headers.ContainsKey(AdminHeader))
            claims.Add(new Claim(ClaimTypes.Role, Roles.Admin));

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
    }
}

public static class TestAuthenticationExtensions
{
    public static IServiceCollection AddTestAuthentication(this IServiceCollection services)
    {
        services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultForbidScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
        return services;
    }
}

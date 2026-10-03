using System.Security.Claims;
using System.Text.Encodings.Web;
using InSeconds.Api.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InSeconds.IntegrationTests;

/// <summary>
/// Joueur simulé par deux en-têtes, pour les tests d'autorisation des routes. Les tests du cookie
/// lui-même (B1) n'envoient pas ces en-têtes : ils passent par le vrai cookie de l'API.
/// </summary>
public sealed record TestUser(Guid PlayerId, bool IsAdmin)
{
    public static readonly TestUser Player = new(Guid.Parse("0000000a-0000-0000-0000-000000000001"), IsAdmin: false);
    public static readonly TestUser Admin = new(Guid.Parse("0000000a-0000-0000-0000-000000000002"), IsAdmin: true);

    internal void Apply(HttpClient client)
    {
        client.DefaultRequestHeaders.Add(TestAuthHandler.PlayerHeader, PlayerId.ToString());
        if (IsAdmin)
            client.DefaultRequestHeaders.Add(TestAuthHandler.AdminHeader, "true");
    }
}

/// <summary>
/// Authentifie la requête d'après deux en-têtes de test. Seule l'authentification est remplacée :
/// le refus (401 sans joueur, 403 sans le rôle) reste celui du cookie de l'API. Sans ces en-têtes,
/// tout passe au cookie de l'API (validation de l'appareil comprise).
/// </summary>
public sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string PlayerHeader = "X-Test-Player";
    public const string AdminHeader = "X-Test-Admin";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new List<Claim> { new(PlayerClaims.PlayerId, Request.Headers[PlayerHeader].ToString()) };
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
                options.DefaultChallengeScheme = AuthSetup.Scheme;
                options.DefaultForbidScheme = AuthSetup.Scheme;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, options =>
                options.ForwardDefaultSelector = context =>
                    context.Request.Headers.ContainsKey(TestAuthHandler.PlayerHeader) ? null : AuthSetup.Scheme);
        return services;
    }
}

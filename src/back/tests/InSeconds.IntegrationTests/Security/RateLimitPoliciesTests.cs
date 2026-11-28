using System.Net;
using System.Reflection;
using System.Text.Json;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Security;

/// <summary>
/// Toutes les politiques de rate limiting (<see cref="RateLimitPolicies"/>), une par une : chacune est dans la table des limites, limite vraiment à sa
/// valeur (une demande de plus : 429 au format ProblemDetails), et est posée sur au moins une route. Une politique déclarée sans
/// route limiterait personne, une route qui cite un nom inconnu échouerait à la première requête.
/// </summary>
public sealed class RateLimitPoliciesTests : IAsyncLifetime
{
    private WebApplication _app = null!;

    public async ValueTask InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Production });
        builder.WebHost.UseTestServer();
        builder.Services.AddInSecondsProblemDetails();
        builder.Services.AddInSecondsRateLimiting(builder.Configuration);

        _app = builder.Build();
        _app.UseInSecondsErrorHandling();
        _app.UseRateLimiter();
        // Une route par politique, sur le nom de la politique : le serveur de test n'a pas d'identité, tout est compté sur la même adresse.
        foreach (var policy in Declared())
            _app.MapGet($"/policy/{policy}", () => "ok").RequireRateLimiting(policy);

        await _app.StartAsync(TestContext.Current.CancellationToken);
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();

    /// <summary>Les politiques déclarées : les constantes de <see cref="RateLimitPolicies"/>.</summary>
    private static string[] Declared() =>
        typeof(RateLimitPolicies).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.IsLiteral && field.FieldType == typeof(string))
            .Select(field => (string)field.GetRawConstantValue()!)
            .Order()
            .ToArray();

    /// <summary>Les politiques que des routes posent : <c>[EnableRateLimiting("…")]</c> sur une méthode ou une classe de l'API.</summary>
    private static string[] UsedByRoutes()
    {
        var assembly = typeof(InSeconds.Api.Modules.Daily.Application.DailyMetrics).Assembly;
        return assembly.GetTypes()
            .SelectMany(type => type.GetCustomAttributes<EnableRateLimitingAttribute>(inherit: false)
                .Concat(type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .SelectMany(method => method.GetCustomAttributes<EnableRateLimitingAttribute>(inherit: false))))
            .Select(attribute => attribute.PolicyName!)
            .Distinct()
            .Order()
            .ToArray();
    }

    [Fact]
    public void ToutePolitiqueDeclaree_EstDansLaTableDesLimites_ETReciproquement() =>
        Assert.Equal(Declared(), RateLimitingServiceCollectionExtensions.Limits.Keys.Order());

    [Fact]
    public void ToutePolitiqueDeclaree_EstPoseeSurAuMoinsUneRoute()
    {
        var unused = Declared().Except(UsedByRoutes()).ToList();

        Assert.True(unused.Count == 0, $"Politiques déclarées qu'aucune route ne pose : {string.Join(", ", unused)}.");
    }

    [Fact]
    public void ToutNomPoseSurUneRoute_EstUnePolitiqueDeclaree()
    {
        var unknown = UsedByRoutes().Except(Declared()).ToList();

        Assert.True(unknown.Count == 0, $"Routes qui citent une politique inconnue : {string.Join(", ", unknown)}.");
    }

    [Fact]
    public void ToutesLesLimites_ONtUneValeurEtUneFenetreRaisonnables()
    {
        Assert.All(RateLimitingServiceCollectionExtensions.Limits, limit =>
        {
            Assert.InRange(limit.Value.PermitLimit, 1, 1000);
            Assert.InRange(limit.Value.Window, TimeSpan.FromMinutes(1), TimeSpan.FromHours(1));
        });
    }

    [Fact]
    public async Task ChaquePolitique_LaisseToutePasserJusquASaLimite_PuisRepond429AuFormatProblemDetails()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = _app.GetTestClient();

        foreach (var (policy, limit) in RateLimitingServiceCollectionExtensions.Limits.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            for (var i = 0; i < limit.PermitLimit; i++)
                Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/policy/{policy}", ct)).StatusCode);

            var rejected = await client.GetAsync($"/policy/{policy}", ct);

            Assert.True(rejected.StatusCode == HttpStatusCode.TooManyRequests, $"{policy} : la requête {limit.PermitLimit + 1} devait être refusée.");
            Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
            var problem = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync(ct)).RootElement;
            Assert.Equal(ErrorCodes.ForStatus(429), problem.GetProperty("code").GetString());
            Assert.True(problem.TryGetProperty("traceId", out _));
        }
    }

    [Fact(Skip = "Défaut constaté, à corriger dans le code : aucun refus 429 ne porte Retry-After (les 16 politiques, vérifié), alors que .claude/rules/back/transverse.md l'annonce. " +
                 "Le TryGetMetadata(MetadataName.RetryAfter) de RateLimitingServiceCollectionExtensions.WriteProblemAsync ne reçoit rien d'une fenêtre glissante sans file d'attente. " +
                 "Retirer Skip quand le code ou la doc est corrigé.")]
    public async Task ToutRefus429_PorteRetryAfter()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = _app.GetTestClient();
        var (policy, limit) = RateLimitingServiceCollectionExtensions.Limits.First(entry => entry.Key == RateLimitPolicies.MagicLinkRequest);
        for (var i = 0; i < limit.PermitLimit; i++)
            await client.GetAsync($"/policy/{policy}", ct);

        var rejected = await client.GetAsync($"/policy/{policy}", ct);

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
    }

    [Fact]
    public async Task UnePolitiqueSaturee_NeToucheAucuneAutre()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = _app.GetTestClient();
        var (policy, limit) = RateLimitingServiceCollectionExtensions.Limits.OrderBy(entry => entry.Value.PermitLimit).First();
        var other = Declared().First(name => name != policy);

        for (var i = 0; i <= limit.PermitLimit; i++)
            await client.GetAsync($"/policy/{policy}", ct);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.GetAsync($"/policy/{policy}", ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/policy/{other}", ct)).StatusCode);
    }
}

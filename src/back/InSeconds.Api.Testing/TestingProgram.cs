using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Testing.Auth;
using InSeconds.Api.Testing.Deezer;
using InSeconds.Api.Testing.E2E;
using InSeconds.Api.Testing.Email;
using InSeconds.Api.Testing.ApiDocs;
using JasperFx;

namespace InSeconds.Api.Testing;

/// <summary>
/// Point d'entrée de l'hôte de test : la composition de l'API (<see cref="ApiComposition"/>), plus les
/// faux, les routes <c>/api/e2e</c> et le dev-login. Refuse de démarrer hors <c>Testing</c> et <c>Development</c>.
/// </summary>
public sealed class TestingProgram
{
    public static readonly string[] AllowedEnvironments = ["Testing", "Development"];

    private TestingProgram()
    {
    }

    public static async Task<int> Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        EnsureTestEnvironment(builder.Environment);

        builder.AddInSecondsApi(args);
        builder.Services.AddCapturingEmailSender();
        builder.Services.AddFakeDeezer();
        builder.Services.AddE2E();
        builder.Services.AddOpenApiDocuments();

        var app = builder.Build();
        app.UseInSecondsApi();
        app.MapE2EEndpoints();
        app.MapDevLogin();
        app.MapOpenApiDocuments();

        return await app.RunJasperFxCommands(args);
    }

    internal static void EnsureTestEnvironment(IHostEnvironment environment)
    {
        if (!AllowedEnvironments.Contains(environment.EnvironmentName, StringComparer.Ordinal))
            throw new InvalidOperationException(
                $"L'hôte de test ne démarre qu'en {string.Join(" ou ", AllowedEnvironments)} (environnement : {environment.EnvironmentName}).");
    }
}

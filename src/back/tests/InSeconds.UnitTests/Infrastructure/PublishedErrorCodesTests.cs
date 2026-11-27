using System.Reflection;
using System.Text.Json;
using InSeconds.Api.Modules.Players.Application;

namespace InSeconds.UnitTests.Infrastructure;

/// <summary>
/// Le pont entre le back et la table front <c>ERROR_MESSAGE_KEYS</c> : la liste des codes d'erreur publiés est commitée côté front
/// (<c>core/errors/published-error-codes.json</c>), le front vérifie que chaque code y est traduit (ou explicitement non traduit),
/// et ce test vérifie qu'elle est à jour. Un nouveau code oublié dans la liste fait échouer le back ; ajouté à la liste, il fait
/// échouer le front tant qu'il n'a ni traduction ni raison de ne pas en avoir. Ne jamais renommer un code publié.
/// </summary>
public class PublishedErrorCodesTests
{
    private const string UpdateVariable = "UPDATE_PUBLISHED_ERROR_CODES";

    private static readonly string[] RelativeDirectory = ["front", "InSeconds.Client", "src", "app", "core", "errors"];

    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    [Fact]
    public void LaListeCommitee_EstCelleDesCodesPublies()
    {
        var expected = PublishedCodes();
        var file = Path.Combine(FrontErrorsDirectory(), "published-error-codes.json");

        if (Environment.GetEnvironmentVariable(UpdateVariable) == "1")
            File.WriteAllText(file, JsonSerializer.Serialize(expected, Json) + "\n");

        var committed = JsonSerializer.Deserialize<string[]>(File.ReadAllText(file))!;
        Assert.True(
            expected.SequenceEqual(committed),
            $"published-error-codes.json n'est pas à jour. Ajoutés au back : [{string.Join(", ", expected.Except(committed))}] ; retirés du back "
            + $"(un code publié ne se renomme jamais) : [{string.Join(", ", committed.Except(expected))}]. "
            + $"Relancer ce test avec {UpdateVariable}=1 réécrit le fichier.");
    }

    [Fact]
    public void ChaqueCode_EstEcritModuleRaison_EnMinusculesEtSouligne()
    {
        var codes = PublishedCodes();

        Assert.All(codes, code => Assert.Matches(@"^[a-z]+\.[a-z0-9_]+$", code));
        Assert.Equal(codes.Length, codes.Distinct().Count());
    }

    /// <summary>Les constantes de chaque classe <c>*ErrorCodes</c> de l'API, plus le code d'échec de la tâche de purge (qui vit avec sa tâche).</summary>
    private static string[] PublishedCodes()
    {
        var fromClasses = typeof(PlayersErrorCodes).Assembly.GetTypes()
            .Where(t => t is { IsAbstract: true, IsSealed: true, IsPublic: true } && t.Name.EndsWith("ErrorCodes", StringComparison.Ordinal))
            .SelectMany(t => t.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy))
            .Where(f => f is { IsLiteral: true, IsInitOnly: false } && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!);

        return [.. fromClasses.Append(PlayersPurgeJob.FailedCode).Distinct().Order(StringComparer.Ordinal)];
    }

    private static string FrontErrorsDirectory()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine([directory.FullName, .. RelativeDirectory]);
            if (Directory.Exists(candidate))
                return candidate;
        }

        throw new DirectoryNotFoundException($"Le dossier {string.Join('/', RelativeDirectory)} est introuvable depuis {AppContext.BaseDirectory}.");
    }
}

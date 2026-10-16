using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace InSeconds.Api.Testing.ApiDocs;

/// <summary>
/// Documents OpenAPI de l'hôte de test (§ 6.1 du plan v2 : un client NSwag par module, généré depuis ces
/// documents). Servis seulement ici, jamais par l'API de prod (S9). Un document par module, filtré sur
/// le préfixe de ses routes ; <c>/openapi/players.json</c> pour le module Players, <c>/openapi/catalogue.json</c> pour
/// Catalogue, <c>/openapi/daily.json</c> pour Daily, <c>/openapi/admin.json</c> pour le suivi des tâches. Les documents sauvegardés pour le front sont <c>openapi/players.json</c>, <c>openapi/catalogue.json</c>, <c>openapi/daily.json</c> et <c>openapi/admin.json</c>
/// (cf. CLAUDE.md du back).
/// </summary>
public static class OpenApiDocuments
{
    public const string Players = "players";
    public const string Catalogue = "catalogue";
    public const string Daily = "daily";
    public const string Admin = "admin";

    public static IServiceCollection AddOpenApiDocuments(this IServiceCollection services)
    {
        AddModuleDocument(services, Players, tag: "Players", "api/players");
        // Deux préfixes : la recherche publique, et les routes admin du pool.
        AddModuleDocument(services, Catalogue, tag: "Catalogue", "api/catalogue", "api/admin/catalogue");
        // Le jeu du jour (E5) et ses routes admin (défi du jour, stats, récap hebdo, tableau de bord, historique, cooldown : E3, F1). La liste
        // des joueurs inscrits (`api/admin/players`) est servie par Daily : seul Daily lit à la fois les comptes (contrat de Players) et les séries.
        AddModuleDocument(services, Daily, tag: "Daily", "api/daily", "api/admin/daily", "api/admin/players");
        // Le suivi d'une tâche lancée par un bouton de l'admin (F2) : l'infrastructure, pas un module.
        AddModuleDocument(services, Admin, tag: "Admin", "api/admin/jobs");
        return services;
    }

    public static IEndpointRouteBuilder MapOpenApiDocuments(this IEndpointRouteBuilder routes)
    {
        routes.MapOpenApi();
        return routes;
    }

    /// <summary>
    /// Dans un corps de requête, une propriété qui peut être nulle (<c>string? Pseudo</c>) est facultative :
    /// le client généré n'oblige pas à l'envoyer. Dans une réponse, elle reste présente (nulle ou non).
    /// </summary>
    private static void MakeNullableRequestPropertiesOptional(OpenApiDocument document)
    {
        var requestSchemas = document.Paths.Values
            .SelectMany(path => (IEnumerable<OpenApiOperation>?)path.Operations?.Values ?? [])
            .Select(operation => operation.RequestBody?.Content is { } content && content.TryGetValue("application/json", out var json) ? json.Schema : null)
            .OfType<OpenApiSchemaReference>()
            .Select(reference => reference.Reference.Id)
            .OfType<string>()
            .ToHashSet(StringComparer.Ordinal);

        foreach (var name in requestSchemas)
        {
            if (document.Components?.Schemas is not { } schemas || !schemas.TryGetValue(name, out var found) || found is not OpenApiSchema { Required: { } required, Properties: { } properties })
                continue;
            foreach (var (property, schema) in properties)
                if (schema.Type is { } type && type.HasFlag(JsonSchemaType.Null))
                    required.Remove(property);
        }
    }

    private static void AddModuleDocument(IServiceCollection services, string name, string tag, params string[] routePrefixes) =>
        services.AddOpenApi(name, options =>
        {
            options.ShouldInclude = description =>
                routePrefixes.Any(prefix => description.RelativePath?.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) == true);

            // Le document ne doit pas dépendre de l'adresse où il a été lu.
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info = new OpenApiInfo { Title = $"InSeconds · {tag}", Version = "v2" };
                document.Servers = [];
                MakeNullableRequestPropertiesOptional(document);
                return Task.CompletedTask;
            });

            // .NET décrit un entier comme "integer ou string" avec un motif : le client généré doit avoir un nombre
            // (et un entier nullable, comme l'année d'un morceau, reste nullable). Sauf le « status » d'un ProblemDetails,
            // que le client des joueurs (B5) a déjà généré en nombre : son schéma ne change pas.
            options.AddSchemaTransformer((schema, context, _) =>
            {
                if (schema.Type is { } type && type.HasFlag(JsonSchemaType.Integer))
                {
                    var isProblemDetails = context.JsonPropertyInfo?.DeclaringType is { } owner && typeof(ProblemDetails).IsAssignableFrom(owner);
                    schema.Type = type.HasFlag(JsonSchemaType.Null) && !isProblemDetails ? JsonSchemaType.Integer | JsonSchemaType.Null : JsonSchemaType.Integer;
                    schema.Pattern = null;
                }

                // Même chose pour un décimal (durées en secondes, moyennes) : un nombre, jamais « nombre ou texte ».
                if (schema.Type is { } number && number.HasFlag(JsonSchemaType.Number))
                {
                    schema.Type = number.HasFlag(JsonSchemaType.Null) ? JsonSchemaType.Number | JsonSchemaType.Null : JsonSchemaType.Number;
                    schema.Pattern = null;
                }

                return Task.CompletedTask;
            });

            options.AddOperationTransformer((operation, _, _) =>
            {
                // Un seul tag par module : NSwag en tire un seul client (PlayersClient). Les titres et
                // descriptions que Wolverine déduit de la route n'apportent rien.
                operation.Tags = new HashSet<OpenApiTagReference> { new(tag) };
                operation.Summary = null;
                operation.Description = null;

                // Wolverine déclare un 404 sans schéma sur presque toutes ses routes : une réponse que
                // l'API ne renvoie pas. Seul un 404 ProblemDetails déclaré (ProducesResponseType) reste.
                if (operation.Responses is { } responses
                    && responses.TryGetValue("404", out var notFound)
                    && notFound.Content?.ContainsKey("application/problem+json") != true)
                    responses.Remove("404");

                // Une 204 n'a pas de corps.
                if (operation.Responses is { } all && all.TryGetValue("204", out var noContent) && noContent is OpenApiResponse empty)
                    empty.Content = null;

                return Task.CompletedTask;
            });
        });
}

using System.Collections.Concurrent;
using System.Reflection;

namespace InSeconds.Api.Common.Email;

// Rend un email HTML à partir de fichiers .html embarqués dans l'assembly
// (Common/Email/Templates/*.html, marqués <EmbeddedResource> dans le csproj).
// Pas de moteur de template : chaque fichier est un document HTML complet
// (DA reprise du jeu), on ne fait qu'une substitution littérale des jetons
// {{CLEF}} (ex. {{MAGIC_LINK_URL}}). Le fichier est lu une fois puis mis en cache.
internal static class EmailTemplateRenderer
{
    private const string ResourcePrefix = "InSeconds.Api.Common.Email.Templates.";
    private static readonly Assembly Assembly = typeof(EmailTemplateRenderer).Assembly;
    private static readonly ConcurrentDictionary<string, string> Cache = new();

    public static string Render(string templateName, IReadOnlyDictionary<string, string> variables)
    {
        var html = Load(templateName);

        foreach (var (key, value) in variables)
            html = html.Replace("{{" + key + "}}", value);

        return html;
    }

    private static string Load(string name) => Cache.GetOrAdd(name, static n =>
    {
        var resourceName = ResourcePrefix + n + ".html";
        using var stream = Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Template email introuvable : {resourceName}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });
}

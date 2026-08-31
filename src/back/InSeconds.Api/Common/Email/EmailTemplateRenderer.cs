using System.Collections.Concurrent;
using System.Reflection;
using System.Text.RegularExpressions;

namespace InSeconds.Api.Common.Email;

// Assemble un email HTML : un layout commun (_layout.html — <head>/<style>, décor,
// header, coquille de carte, footer) dans lequel on injecte les sections propres à
// chaque email. Le fichier {name}.html porte ces sections, délimitées par des
// marqueurs "<!--#nom-->" (preheader / body / footer). Substitution littérale
// ensuite pour les jetons {{CLEF}} (aujourd'hui {{MAGIC_LINK_URL}}). Pas de moteur
// de template. Fichiers .html embarqués (<EmbeddedResource>), lus une fois puis cachés.
internal static partial class EmailTemplateRenderer
{
    private const string ResourcePrefix = "InSeconds.Api.Common.Email.Templates.";
    private static readonly Assembly Assembly = typeof(EmailTemplateRenderer).Assembly;
    private static readonly ConcurrentDictionary<string, string> Cache = new();

    public static string Render(string templateName, IReadOnlyDictionary<string, string> variables)
    {
        var html = Load("_layout");

        foreach (var (name, content) in ParseSections(Load(templateName)))
            html = html.Replace("{{SECTION:" + name + "}}", content);

        if (html.Contains("{{SECTION:", StringComparison.Ordinal))
            throw new InvalidOperationException(
                $"Section manquante dans le template email '{templateName}' (marqueur <!--#nom--> absent).");

        foreach (var (key, value) in variables)
            html = html.Replace("{{" + key + "}}", value);

        return html;
    }

    // "<!--#body-->\n ...contenu... \n<!--#footer-->..." → (body, "..."), (footer, "...")
    private static IEnumerable<(string Name, string Content)> ParseSections(string raw)
    {
        var markers = SectionMarker().Matches(raw);
        for (var i = 0; i < markers.Count; i++)
        {
            var start = markers[i].Index + markers[i].Length;
            var end = i + 1 < markers.Count ? markers[i + 1].Index : raw.Length;
            yield return (markers[i].Groups[1].Value, raw[start..end].Trim());
        }
    }

    private static string Load(string name) => Cache.GetOrAdd(name, static n =>
    {
        var resourceName = ResourcePrefix + n + ".html";
        using var stream = Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Template email introuvable : {resourceName}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });

    [GeneratedRegex(@"<!--#([a-z]+)-->")]
    private static partial Regex SectionMarker();
}

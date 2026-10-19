using System.Collections.Concurrent;
using System.Reflection;
using System.Text.RegularExpressions;

namespace InSeconds.Api.Modules.Players.Email;

/// <summary>Un email prêt à envoyer.</summary>
public sealed record ComposedEmail(string Subject, string HtmlBody);

/// <summary>Compose un email du module Players à partir de son modèle (§ 5.3 du plan v2), un par email.</summary>
public interface IEmailComposer<in TModel>
{
    ComposedEmail Compose(TModel model);
}

/// <summary>
/// Gabarits repris de la v1 (<c>Templates/</c>, embarqués dans la DLL) : <c>_layout.html</c> porte tout
/// le commun (style, en-tête, carte, pied de page) avec des trous <c>{{SECTION:nom}}</c> ; chaque email
/// fournit ses sections, délimitées par <c>&lt;!--#nom--&gt;</c>. Puis substitution littérale des
/// jetons <c>{{CLEF}}</c>. Pas de moteur de gabarits ; fichiers lus une fois puis gardés.
/// </summary>
internal static partial class EmailTemplateRenderer
{
    private const string ResourcePrefix = "InSeconds.Api.Modules.Players.Email.Templates.";
    private static readonly Assembly Assembly = typeof(EmailTemplateRenderer).Assembly;
    private static readonly ConcurrentDictionary<string, string> Cache = new();

    public static string Render(string templateName, IReadOnlyDictionary<string, string> variables)
    {
        var html = Load("_layout");

        foreach (var (name, content) in ParseSections(Load(templateName)))
            html = html.Replace("{{SECTION:" + name + "}}", content, StringComparison.Ordinal);

        if (html.Contains("{{SECTION:", StringComparison.Ordinal))
            throw new InvalidOperationException(
                $"Section manquante dans le gabarit d'email '{templateName}' (marqueur <!--#nom--> absent).");

        foreach (var (key, value) in variables)
            html = html.Replace("{{" + key + "}}", value, StringComparison.Ordinal);

        return html;
    }

    // "<!--#body-->\n …contenu… \n<!--#footer-->…" → (body, "…"), (footer, "…")
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
            ?? throw new InvalidOperationException($"Gabarit d'email introuvable : {resourceName}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    });

    [GeneratedRegex("<!--#([a-z]+)-->")]
    private static partial Regex SectionMarker();
}

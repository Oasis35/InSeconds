using System.Globalization;
using System.Text.Json;

namespace InSeconds.Api.Infrastructure.Settings;

/// <summary>
/// Transforme la valeur JSON d'un réglage en entrées de configuration, comme le fait le fichier
/// <c>appsettings.json</c> : un tableau devient <c>Clé:0</c>, <c>Clé:1</c>…, un objet devient
/// <c>Clé:Propriété</c>. Le binder standard sait ensuite remplir un <c>decimal[]</c> ou un
/// <c>Dictionary&lt;decimal, int&gt;</c> sans code de conversion dédié.
/// </summary>
internal static class SettingsJsonFlattener
{
    public static void Flatten(string key, string json, IDictionary<string, string?> target)
    {
        using var document = JsonDocument.Parse(json);
        Flatten(key, document.RootElement, target);
    }

    private static void Flatten(string path, JsonElement element, IDictionary<string, string?> target)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                    Flatten($"{path}:{property.Name}", property.Value, target);
                break;
            case JsonValueKind.Array:
                var index = 0;
                foreach (var item in element.EnumerateArray())
                    Flatten($"{path}:{index++.ToString(CultureInfo.InvariantCulture)}", item, target);
                break;
            case JsonValueKind.String:
                target[path] = element.GetString();
                break;
            case JsonValueKind.Null:
                target[path] = null;
                break;
            default:
                // Nombres et booléens : texte JSON brut ("0.5", "true"), lu en culture invariante par le binder.
                target[path] = element.GetRawText();
                break;
        }
    }
}

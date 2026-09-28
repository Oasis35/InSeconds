using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Common.Email;

public sealed class EmailRedirectOptions
{
    // Adresse qui reçoit TOUS les emails à la place du destinataire prévu. Vide = pas de redirection.
    public string To { get; set; } = "";
    // Préfixe d'objet et libellé du bandeau, ex. "DEV".
    public string Label { get; set; } = "DEV";

    public bool Enabled => !string.IsNullOrWhiteSpace(To);
}

// Hors prod (staging) : redirige chaque email vers EmailRedirectOptions.To, préfixe l'objet par
// "[Label]" et ajoute en tête du corps un bandeau qui rappelle l'environnement et le destinataire
// d'origine. Un vrai joueur (base staging copiée de la prod) ne reçoit donc jamais d'email du
// staging. Branché dans Program.cs, obligatoire en Staging.
public sealed partial class RedirectingEmailSender(IEmailSender inner, IOptions<EmailRedirectOptions> options) : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var redirect = options.Value;
        return inner.SendAsync(
            redirect.To,
            $"[{redirect.Label}] {subject}",
            InsertBanner(htmlBody, BuildBanner(redirect.Label, to)),
            ct);
    }

    internal static string BuildBanner(string label, string originalTo) =>
        $"""<div style="background:#f59e0b;color:#1a1a1a;font-family:Arial,sans-serif;font-size:14px;padding:12px 16px;text-align:center;"><strong>{WebUtility.HtmlEncode(label)}</strong> — environnement de développement. Destinataire d'origine : {WebUtility.HtmlEncode(originalTo)}</div>""";

    // Juste après la balise <body ...> quand il y en a une (templates complets), sinon en tête.
    internal static string InsertBanner(string htmlBody, string banner)
    {
        var match = BodyOpenTag().Match(htmlBody);
        return match.Success
            ? htmlBody.Insert(match.Index + match.Length, banner)
            : banner + htmlBody;
    }

    [GeneratedRegex(@"<body\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex BodyOpenTag();
}

using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace InSeconds.Infrastructure.Email;

public sealed class EmailRedirectOptions
{
    public const string Section = "EmailRedirect";

    /// <summary>Adresse qui reçoit tous les emails à la place du destinataire prévu. Vide = pas de redirection.</summary>
    public string To { get; set; } = "";

    /// <summary>Libellé du bandeau, ex. « DEV ».</summary>
    public string Label { get; set; } = "DEV";

    public bool Enabled => !string.IsNullOrWhiteSpace(To);
}

/// <summary>
/// Staging : envoie chaque email à <see cref="EmailRedirectOptions.To"/>, avec en tête un bandeau qui
/// rappelle l'environnement et le destinataire d'origine. La base du staging est une copie de la
/// prod : un vrai joueur ne doit jamais recevoir un email du staging. L'objet reste inchangé (Gmail
/// regroupe les mails d'objet proche et afficherait un préfixe « [DEV] » sur ceux de la prod).
/// </summary>
public sealed partial class RedirectingEmailSender(IEmailSender inner, IOptions<EmailRedirectOptions> options) : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var redirect = options.Value;
        return inner.SendAsync(redirect.To, subject, InsertBanner(htmlBody, BuildBanner(redirect.Label, to)), ct);
    }

    internal static string BuildBanner(string label, string originalTo) =>
        $"""<div style="background:#f59e0b;color:#1a1a1a;font-family:Arial,sans-serif;font-size:14px;padding:12px 16px;text-align:center;"><strong>{WebUtility.HtmlEncode(label)}</strong> — environnement de développement. Destinataire d'origine : {WebUtility.HtmlEncode(originalTo)}</div>""";

    /// <summary>Juste après la balise <c>&lt;body&gt;</c> quand il y en a une, sinon en tête.</summary>
    internal static string InsertBanner(string htmlBody, string banner)
    {
        var match = BodyOpenTag().Match(htmlBody);
        return match.Success ? htmlBody.Insert(match.Index + match.Length, banner) : banner + htmlBody;
    }

    [GeneratedRegex(@"<body\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex BodyOpenTag();
}

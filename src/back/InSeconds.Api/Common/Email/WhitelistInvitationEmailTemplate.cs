namespace InSeconds.Api.Common.Email;

// Wording volontairement neutre ("tu as accès à IN//SECONDS" plutôt que "bienvenue,
// crée ton premier compte") : couvre aussi bien la première invitation que le cas où
// l'admin retire puis re-whitelist un email déjà lié à un compte existant.
public static class WhitelistInvitationEmailTemplate
{
    public static (string Subject, string Html) Build(string magicLinkUrl)
    {
        const string subject = "Tu es invité·e sur IN//SECONDS";

        var html = $"""
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
              <h1 style="font-size:20px;letter-spacing:0.05em;color:#e05d38">IN//SECONDS</h1>
              <p>Tu as accès à IN//SECONDS, le blind test musical quotidien.</p>
              <p>Avec un compte, tu peux jouer depuis plusieurs appareils et retrouver ton historique/streak à chaque connexion.</p>
              <p style="margin:24px 0">
                <a href="{magicLinkUrl}" style="background:#e05d38;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">
                  Créer mon compte
                </a>
              </p>
              <p style="color:#888;font-size:13px">Ce lien expire dans 7 jours.</p>
              <p style="color:#888;font-size:13px">Astuce : connecte-toi depuis le navigateur où tu joues d'habitude pour garder ton historique.</p>
            </div>
            """;

        return (subject, html);
    }
}

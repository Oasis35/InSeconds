namespace InSeconds.Api.Common.Email;

// Template pur (pas de moteur de template) — style inline, les clients mail
// ignorent les <style> externes. Couleurs en dur (les variables CSS du front
// ne sont pas accessibles côté email).
public static class MagicLinkEmailTemplate
{
    public static (string Subject, string Html) Build(string magicLinkUrl)
    {
        const string subject = "Ton lien de connexion IN//SECONDS";

        var html = $"""
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
              <h1 style="font-size:20px;letter-spacing:0.05em;color:#e05d38">IN//SECONDS</h1>
              <p>Clique sur le bouton ci-dessous pour te connecter :</p>
              <p style="margin:24px 0">
                <a href="{magicLinkUrl}" style="background:#e05d38;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">
                  Se connecter
                </a>
              </p>
              <p style="color:#888;font-size:13px">Ce lien expire dans 15 minutes.</p>
              <p style="color:#888;font-size:13px">Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
            </div>
            """;

        return (subject, html);
    }
}

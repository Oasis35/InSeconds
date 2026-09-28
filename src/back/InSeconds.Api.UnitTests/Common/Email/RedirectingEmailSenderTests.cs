using FluentAssertions;
using InSeconds.Api.Common.Email;
using Microsoft.Extensions.Options;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Email;

public sealed class RedirectingEmailSenderTests
{
    private sealed class CapturingSender : IEmailSender
    {
        public (string To, string Subject, string Html)? Last { get; private set; }

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
        {
            Last = (to, subject, htmlBody);
            return Task.CompletedTask;
        }
    }

    private static (RedirectingEmailSender Sender, CapturingSender Inner) Create()
    {
        var inner = new CapturingSender();
        var options = Options.Create(new EmailRedirectOptions { To = "dev@example.com", Label = "DEV" });
        return (new RedirectingEmailSender(inner, options), inner);
    }

    [Fact]
    public async Task SendAsync_redirige_vers_l_adresse_configuree_et_prefixe_l_objet()
    {
        var (sender, inner) = Create();

        await sender.SendAsync("joueur@example.com", "Ton lien de connexion", "<p>Corps</p>");

        inner.Last!.Value.To.Should().Be("dev@example.com");
        inner.Last.Value.Subject.Should().Be("[DEV] Ton lien de connexion");
    }

    [Fact]
    public async Task SendAsync_ajoute_un_bandeau_avec_le_destinataire_d_origine_juste_apres_body()
    {
        var (sender, inner) = Create();

        await sender.SendAsync("joueur@example.com", "Sujet", "<html><body style=\"margin:0\"><p>Corps</p></body></html>");

        var html = inner.Last!.Value.Html;
        html.Should().StartWith("<html><body style=\"margin:0\"><div");
        html.Should().Contain("environnement de développement");
        html.Should().Contain("joueur@example.com");
        html.Should().EndWith("<p>Corps</p></body></html>");
    }

    [Fact]
    public async Task SendAsync_sans_balise_body_place_le_bandeau_en_tete()
    {
        var (sender, inner) = Create();

        await sender.SendAsync("joueur@example.com", "Sujet", "<p>Corps</p>");

        inner.Last!.Value.Html.Should().StartWith("<div").And.EndWith("<p>Corps</p>");
    }

    [Fact]
    public void BuildBanner_echappe_le_destinataire()
    {
        RedirectingEmailSender.BuildBanner("DEV", "<script>@example.com")
            .Should().Contain("&lt;script&gt;@example.com").And.NotContain("<script>");
    }

    [Theory]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("dev@example.com", true)]
    public void Enabled_seulement_si_une_adresse_est_renseignee(string to, bool expected)
    {
        new EmailRedirectOptions { To = to }.Enabled.Should().Be(expected);
    }
}

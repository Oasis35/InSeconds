using InSeconds.Infrastructure.Email;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Infrastructure.Email;

public class RedirectingEmailSenderTests
{
    private readonly RecordingSender _inner = new();

    [Fact]
    public async Task Envoi_PartVersLAdresseDeRedirection_ObjetInchange()
    {
        await CreateSender().SendAsync("joueur@example.com", "Ton lien", "<html><body><p>Salut</p></body></html>", TestContext.Current.CancellationToken);

        var (to, subject, _) = Assert.Single(_inner.Sent);
        Assert.Equal("moi+staging@example.com", to);
        Assert.Equal("Ton lien", subject);
    }

    [Fact]
    public async Task Envoi_AjouteLeBandeauJusteApresBody_AvecLeDestinataireDOrigine()
    {
        await CreateSender().SendAsync("joueur@example.com", "Ton lien", "<html><body class=\"x\"><p>Salut</p></body></html>", TestContext.Current.CancellationToken);

        var html = Assert.Single(_inner.Sent).HtmlBody;
        Assert.StartsWith("<html><body class=\"x\"><div", html);
        Assert.Contains("joueur@example.com", html);
        Assert.Contains("<strong>DEV</strong>", html);
        Assert.EndsWith("<p>Salut</p></body></html>", html);
    }

    [Fact]
    public void Bandeau_SansBalisebody_EnTete()
    {
        Assert.Equal("[B]<p>Salut</p>", RedirectingEmailSender.InsertBanner("<p>Salut</p>", "[B]"));
    }

    [Fact]
    public void Bandeau_EchappeLeLibelleEtLAdresse()
    {
        var banner = RedirectingEmailSender.BuildBanner("<DEV>", "a&b@example.com");

        Assert.Contains("&lt;DEV&gt;", banner);
        Assert.Contains("a&amp;b@example.com", banner);
    }

    private RedirectingEmailSender CreateSender() =>
        new(_inner, Options.Create(new EmailRedirectOptions { To = "moi+staging@example.com" }));

    private sealed class RecordingSender : IEmailSender
    {
        public List<(string To, string Subject, string HtmlBody)> Sent { get; } = [];

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
        {
            Sent.Add((to, subject, htmlBody));
            return Task.CompletedTask;
        }
    }
}

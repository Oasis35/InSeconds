using System.Net.Http.Headers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace InSeconds.Infrastructure.Email;

public static class EmailServiceCollectionExtensions
{
    /// <summary>
    /// Brevo, redirigé si <c>EmailRedirect:To</c> est renseigné. En staging, la redirection est
    /// obligatoire (l'API refuse de démarrer sans) ; en prod et en staging, la clé Brevo et
    /// l'expéditeur sont vérifiés au démarrage. L'hôte de test remplace <see cref="IEmailSender"/>
    /// par un faux qui capture les emails.
    /// </summary>
    public static IServiceCollection AddInSecondsEmail(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var brevo = services.AddOptions<BrevoOptions>()
            .BindConfiguration(BrevoOptions.Section)
            .Validate(o => !string.IsNullOrWhiteSpace(o.ApiKey) && !string.IsNullOrWhiteSpace(o.SenderEmail),
                "Brevo:ApiKey et Brevo:SenderEmail sont requis pour envoyer un email.");
        if (environment.IsProduction() || environment.IsStaging())
            brevo.ValidateOnStart();

        services.AddHttpClient<BrevoEmailSender>((sp, client) =>
        {
            client.BaseAddress = new Uri(BrevoEmailSender.BaseAddress);
            client.DefaultRequestHeaders.Add("api-key", sp.GetRequiredService<IOptions<BrevoOptions>>().Value.ApiKey);
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        });

        services.AddOptions<EmailRedirectOptions>().BindConfiguration(EmailRedirectOptions.Section);
        var redirect = configuration.GetSection(EmailRedirectOptions.Section).Get<EmailRedirectOptions>() ?? new();
        if (environment.IsStaging() && !redirect.Enabled)
            throw new InvalidOperationException("EmailRedirect:To doit être renseigné en Staging : sa base est une copie de la prod.");

        if (redirect.Enabled)
            services.AddTransient<IEmailSender>(sp => new RedirectingEmailSender(
                sp.GetRequiredService<BrevoEmailSender>(), sp.GetRequiredService<IOptions<EmailRedirectOptions>>()));
        else
            services.AddTransient<IEmailSender>(sp => sp.GetRequiredService<BrevoEmailSender>());

        return services;
    }
}

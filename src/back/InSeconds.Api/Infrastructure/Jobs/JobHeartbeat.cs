using Microsoft.Extensions.Options;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Réglages de la surveillance des tâches par healthchecks.io (<c>Healthchecks:*</c>, § 5.4 bis du plan v2, #315).
/// Sans clé, rien n'est envoyé (dev, tests). Le staging a sa propre clé, celle d'un projet healthchecks.io séparé.
/// </summary>
public sealed class HealthchecksOptions
{
    public const string Section = "Healthchecks";

    /// <summary>
    /// Clé de ping du projet healthchecks.io (Settings → Ping key). Secret : jamais journalisée.
    /// En prod, <c>HEALTHCHECKS_PING_KEY</c> de <c>.env.prod</c>.
    /// </summary>
    public string? PingKey { get; set; }

    /// <summary>Adresse des pings ; remplacée dans les tests.</summary>
    public string BaseUrl { get; set; } = "https://hc-ping.com";

    public bool Enabled => !string.IsNullOrWhiteSpace(PingKey);
}

/// <summary>
/// Signale à healthchecks.io le passage d'une tâche récurrente : <c>&lt;clé&gt;/&lt;id de la tâche&gt;</c> si elle a
/// réussi, <c>…/fail</c> si elle a échoué. healthchecks.io prévient (email) si un signal de réussite manque à l'heure
/// prévue ou dès qu'un échec arrive ; le contrôle est créé au premier signal (<c>create=1</c>). Ne lève jamais : un
/// healthchecks.io injoignable ne fait pas échouer la tâche, il donne un avertissement dans les journaux.
/// </summary>
public sealed class JobHeartbeat(HttpClient http, IOptions<HealthchecksOptions> options, ILogger<JobHeartbeat> logger)
{
    public async Task SignalAsync(string jobId, bool succeeded, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!settings.Enabled)
            return;

        var url = $"{settings.BaseUrl.TrimEnd('/')}/{Uri.EscapeDataString(settings.PingKey!)}/{Uri.EscapeDataString(jobId)}"
            + (succeeded ? "" : "/fail") + "?create=1";
        try
        {
            using var response = await http.PostAsync(url, content: null, cancellationToken);
            if (!response.IsSuccessStatusCode)
                logger.LogWarning("Signal healthchecks.io de la tâche {JobId} refusé : HTTP {StatusCode}",
                    jobId, (int)response.StatusCode);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            // Le message de l'exception peut contenir l'adresse, donc la clé : seul son type est journalisé.
            logger.LogWarning("Signal healthchecks.io de la tâche {JobId} impossible : {ExceptionType}",
                jobId, exception.GetType().Name);
        }
    }
}

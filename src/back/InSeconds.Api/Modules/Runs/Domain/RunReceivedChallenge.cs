namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Un défi d'ami reçu : un compte a ouvert le lien d'une playlist lancée par un autre joueur sans l'avoir jouée. Le serveur s'en souvient pour que
/// l'accueil le rappelle (« Léa t'a défié ») jusqu'à ce que le joueur la joue, la refuse ou que <see cref="LifetimeDays"/> jours passent.
/// Une seule ligne par compte et par playlist : ouvrir le lien deux fois ne prolonge rien.
/// </summary>
public sealed class RunReceivedChallenge
{
    /// <summary>Les jours pendant lesquels un défi reçu reste proposé sur l'accueil.</summary>
    public const int LifetimeDays = 7;

    private RunReceivedChallenge()
    {
    }

    public Guid PlayerId { get; private set; }

    public int ChallengeId { get; private set; }

    public DateTimeOffset ReceivedAt { get; private set; }

    /// <summary>Quand le joueur l'a refusé (la croix du bandeau) ; vide tant qu'il ne l'a pas fait.</summary>
    public DateTimeOffset? DismissedAt { get; private set; }

    public DateTimeOffset ExpiresAt => ReceivedAt.AddDays(LifetimeDays);

    public static RunReceivedChallenge Receive(Guid playerId, int challengeId, DateTimeOffset now) =>
        new() { PlayerId = playerId, ChallengeId = challengeId, ReceivedAt = now };

    /// <summary>Refuse le défi ; idempotent (la première date est gardée).</summary>
    public void Dismiss(DateTimeOffset now) => DismissedAt ??= now;
}

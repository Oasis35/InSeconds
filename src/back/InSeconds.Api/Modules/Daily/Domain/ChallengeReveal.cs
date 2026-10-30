namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Un admin a affiché le défi d'un jour dans l'admin avant d'en finir la partie (« Afficher quand même », table <c>challenge_reveals</c>). Sa partie
/// de ce défi, commencée avant ou après, ne compte alors dans **aucune statistique** : il l'a jouée en connaissant les réponses. Sans ce clic, le
/// défi du jour reste masqué dans l'admin jusqu'à la fin de sa partie, et sa partie compte comme celle de n'importe quel joueur.
/// </summary>
public sealed class ChallengeReveal
{
    private ChallengeReveal()
    {
    }

    public int ChallengeId { get; private set; }

    public Guid PlayerId { get; private set; }

    public DateTimeOffset RevealedAt { get; private set; }

    public static ChallengeReveal Create(int challengeId, Guid playerId, DateTimeOffset now) =>
        new() { ChallengeId = challengeId, PlayerId = playerId, RevealedAt = now };
}

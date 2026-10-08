using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>La partie d'un joueur, verrouillée pour la durée de la transaction, et le défi qu'elle joue.</summary>
public sealed record PlayableSession(DailySession Session, DailyChallenge Challenge)
{
    /// <summary>Le morceau du défi à cette position, ou rien si elle n'existe pas.</summary>
    public ChallengeTrack? TrackAt(int position) => Challenge.Tracks.FirstOrDefault(t => t.Position == position);
}

/// <summary>Ce que partagent les routes qui agissent sur une partie en cours : la charger, et refuser ce qui n'a pas lieu d'être.</summary>
internal static class SessionAccess
{
    /// <summary>
    /// La partie de cet identifiant si elle appartient au joueur de la requête, **verrouillée** jusqu'à la fin de la transaction. La
    /// partie d'un autre joueur est rendue comme une partie inconnue.
    /// </summary>
    public static async Task<PlayableSession?> LoadAsync(int sessionId, ICurrentPlayer current, IDailyStore store, CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId)
            return null;

        var session = await store.FindSessionForUpdateAsync(sessionId, playerId, ct);
        if (session is null)
            return null;

        // Le défi d'une partie existe toujours : la clé étrangère l'impose.
        var challenge = await store.FindChallengeAsync(session.ChallengeId, ct);
        return challenge is null ? null : new PlayableSession(session, challenge);
    }

    /// <summary>
    /// La partie est inconnue, n'est plus en cours, ou ce morceau n'est pas celui qu'on peut jouer maintenant (piège 35). <paramref name="position"/>
    /// vide : on ne vise aucun morceau (abandon).
    /// </summary>
    public static ProblemDetails Check(PlayableSession? loaded, int? position)
    {
        if (loaded is null)
            return DailyProblems.SessionNotFound();
        if (loaded.Session.Status != SessionStatus.Pending)
            return DailyProblems.NotPending(loaded.Session.Status);
        if (position is { } p && DailyProblems.ForTurn(loaded.Session.TurnOf(p, loaded.Challenge.Tracks.Count)) is { } problem)
            return problem;

        return WolverineContinue.NoProblems;
    }
}

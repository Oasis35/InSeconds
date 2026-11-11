using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Le fantôme de l'ami qui a lancé la playlist, pour la partie en cours d'un autre joueur (<see cref="RunGhost"/>) : les points de l'auteur s'il
/// l'a finie (gagnée ou perdue) et son pseudo. Il suit le joueur jusqu'à l'écran de fin, où il fait le duel (« Tu bats Léa de 126 pts »), mais
/// rien avant son premier morceau joué.
/// </summary>
public sealed class RunGhosts(IRunsQueries queries, IPlayerDirectory players)
{
    public async Task<RunGhostResponse?> OfAsync(RunSession session, RunChallenge challenge, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(session);
        ArgumentNullException.ThrowIfNull(challenge);
        var played = session.Answers.Where(a => !a.Neutralized).Select(a => (int)a.Position).ToList();
        if (!RunGhost.Haunts(challenge.CreatedBy, session.PlayerId) || played.Count == 0)
            return null;
        var author = challenge.CreatedBy!.Value;
        var points = await queries.FindFinishedPointsAsync(challenge.Id, author, ct);
        if (points is null)
            return null;

        var stopped = RunGhost.StoppedAt(points, session.Answers.Max(a => (int)a.Position));
        var stoppedRound = stopped is { } position ? challenge.Tracks.FirstOrDefault(t => t.Position == position)?.Round : null;
        var pseudos = await players.GetDisplayNamesAsync([author], ct);
        return new RunGhostResponse(pseudos.GetValueOrDefault(author), RunGhost.TotalOver(points, played), stoppedRound);
    }
}

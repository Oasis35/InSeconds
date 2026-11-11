using FluentValidation;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>« Changer de morceau » : l'Échange du morceau en cours, à cette position.</summary>
public sealed record SwapRunTrack(int Position);

public sealed class SwapRunTrackValidator : AbstractValidator<SwapRunTrack>
{
    public SwapRunTrackValidator()
    {
        RuleFor(x => x.Position).GreaterThan(0);
    }
}

public static class SwapRunTrackEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(SwapRunTrack request, PlayableRun? loaded)
    {
        var problem = RunSessionAccess.Check(loaded, request.Position);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        return loaded!.Session.CanSwap(loaded.Challenge) ? WolverineContinue.NoProblems : RunsProblems.SwapUnavailable();
    }

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/swap</c> : change le morceau en cours pour le suivant de la réserve de sa manche (<c>position</c> est le morceau
    /// en cours). Un Échange par manche, qui ne se garde pas pour la suivante. Rend la partie et le nouveau morceau avec son extrait (écoute et chrono
    /// remis à zéro, la carte gagnée à la manche d'avant aide ce morceau comme les autres). 409 <c>runs.swap_unavailable</c> : déjà fait dans cette
    /// manche, plus de réserve, ou la difficulté de la manche reste à choisir ; et les refus du morceau en cours (piège 35).
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/swap", OperationId = "swapRunTrack")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunPlayResponse> Post(
        SwapRunTrack request, [NotBody] PlayableRun loaded, [NotBody] RunPlayer player, TimeProvider time, [NotBody] RunsMetrics metrics,
        ILogger<SwapRunTrack> logger, CancellationToken ct)
    {
        var (session, challenge) = loaded;
        session.Swap(challenge, time.GetUtcNow());
        RunsLog.TrackSwapped(logger, session.Id, session.PlayerId, request.Position);
        metrics.TrackSwapped();
        return await player.AdvanceAsync(await player.LoadAsync(session, challenge, ct), answered: null, revealed: null, isResuming: false, ct);
    }
}

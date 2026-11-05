using FluentValidation;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

// Les coups de pouce (proto 2, docs/runs/proto2.md § Les coups de pouce) : prendre une carte de l'offre d'un palier, lâcher une carte de la main,
// jouer une carte sur le morceau en cours. Le serveur calcule tous les effets ; rien d'une carte n'identifie un morceau avant sa réponse (piège 31) :
// année, initiales et trois choix ne partent qu'à l'activation, pour le morceau en cours seulement.

/// <summary>Prendre une carte de l'offre du palier qui suit la manche <paramref name="AfterRound"/>. Main pleine : <paramref name="DropSlot"/> est la carte lâchée en échange.</summary>
public sealed record TakeRunCard(int AfterRound, string Card, int? DropSlot);

public sealed class TakeRunCardValidator : AbstractValidator<TakeRunCard>
{
    public TakeRunCardValidator()
    {
        RuleFor(x => x.AfterRound).GreaterThan(0);
        RuleFor(x => x.Card).Must(c => RunCards.Parse(c) is not null).WithMessage("Carte inconnue.");
        RuleFor(x => x.DropSlot).GreaterThan(0).When(x => x.DropSlot is not null);
    }
}

public static class TakeRunCardEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(TakeRunCard request, PlayableRun? loaded)
    {
        var problem = RunSessionAccess.Check(loaded, position: null);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        var (session, challenge) = loaded!;
        var offer = session.OpenOffer(challenge);
        if (offer is null || offer.AfterRound != request.AfterRound || !offer.Cards.Contains(RunCards.Parse(request.Card)!.Value))
            return RunsProblems.OfferClosed();
        var hand = session.Hand;
        if (hand.Count < challenge.Rules.Cards!.HandSize)
            return WolverineContinue.NoProblems;
        if (request.DropSlot is not { } drop)
            return RunsProblems.HandFull();
        return hand.Any(c => c.Slot == drop) ? WolverineContinue.NoProblems : RunsProblems.CardNotFound();
    }

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/cards</c> : prend une carte de l'offre du palier, tant que la manche suivante n'a pas commencé (une offre par
    /// palier ; ne rien prendre, c'est passer). Main pleine : la carte de <c>dropSlot</c> est lâchée en échange, sinon 409 <c>runs.hand_full</c>.
    /// 409 <c>runs.offer_closed</c> hors d'une offre ouverte ou pour une carte qu'elle ne propose pas. Rend l'état de la partie (main à jour).
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/cards", OperationId = "takeRunCard")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunSessionResponse> Post(
        TakeRunCard request, [NotBody] PlayableRun loaded, [NotBody] RunPlayer player, TimeProvider time, ILogger<TakeRunCard> logger,
        CancellationToken ct)
    {
        var (session, challenge) = loaded;
        var card = RunCards.Parse(request.Card)!.Value;
        session.TakeCard(challenge, card, request.DropSlot, time.GetUtcNow());
        RunsLog.CardTaken(logger, session.Id, session.PlayerId, request.AfterRound, request.Card);
        return await player.StateAsync(await player.LoadAsync(session, challenge, ct), ct);
    }
}

public static class DropRunCardEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(int slot, PlayableRun? loaded)
    {
        var problem = RunSessionAccess.Check(loaded, position: null);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        return loaded!.Session.Hand.Any(c => c.Slot == slot) ? WolverineContinue.NoProblems : RunsProblems.CardNotFound();
    }

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/cards/{slot}/drop</c> : lâche une carte de la main (elle ne revient pas). 404 <c>runs.card_not_found</c> si
    /// elle n'y est pas. Rend l'état de la partie.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/cards/{slot}/drop", OperationId = "dropRunCard")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunSessionResponse> Post(
        int slot, [NotBody] PlayableRun loaded, [NotBody] RunPlayer player, TimeProvider time, CancellationToken ct)
    {
        var (session, challenge) = loaded;
        session.DropCard(slot, time.GetUtcNow());
        return await player.StateAsync(await player.LoadAsync(session, challenge, ct), ct);
    }
}

/// <summary>Jouer une carte de la main sur le morceau en cours, à cette position.</summary>
public sealed record PlayRunCard(int Position);

public sealed class PlayRunCardValidator : AbstractValidator<PlayRunCard>
{
    public PlayRunCardValidator()
    {
        RuleFor(x => x.Position).GreaterThan(0);
    }
}

public static class PlayRunCardEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(int slot, PlayRunCard request, PlayableRun? loaded)
    {
        var problem = RunSessionAccess.Check(loaded, request.Position);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        return loaded!.Session.CanPlay(loaded.Challenge, slot) switch
        {
            null => WolverineContinue.NoProblems,
            RunCardRefusal.NotInHand => RunsProblems.CardNotFound(),
            RunCardRefusal.AlreadyActive => RunsProblems.CardAlreadyActive(),
            _ => RunsProblems.CardUnavailable(),
        };
    }

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/cards/{slot}/play</c> : joue une carte de la main sur le morceau en cours (<c>position</c>). Rend la partie et
    /// le morceau en cours avec ses effets (année, initiales, trois réponses, écoute, chrono), servis à cet instant pour ce morceau seulement ; pour le
    /// Joker, le nouveau morceau et son extrait. 404 <c>runs.card_not_found</c>, 409 <c>runs.card_already_active</c> (même carte déjà jouée sur ce
    /// morceau, ou Seuil abaissé déjà joué dans la manche), 409 <c>runs.card_unavailable</c> (plus de réserve pour le Joker, pas de chrono pour le
    /// Sablier), et les refus du morceau en cours (piège 35).
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/cards/{slot}/play", OperationId = "playRunCard")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunPlayResponse> Post(
        int slot, PlayRunCard request, [NotBody] PlayableRun loaded, [NotBody] RunPlayer player, TimeProvider time, ILogger<PlayRunCard> logger,
        CancellationToken ct)
    {
        var (session, challenge) = loaded;
        var card = session.PlayCard(challenge, slot, time.GetUtcNow());
        RunsLog.CardPlayed(logger, session.Id, session.PlayerId, request.Position, RunCards.KeyOf(card.Card));
        return await player.AdvanceAsync(await player.LoadAsync(session, challenge, ct), answered: null, revealed: null, isResuming: false, ct);
    }
}

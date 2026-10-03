using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Daily.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>
/// Ce que la connexion va faire pour une adresse vérifiée, décidé avant toute écriture (lecture seule).
/// </summary>
/// <param name="Email">Adresse vérifiée, normalisée.</param>
/// <param name="Pseudo">Pseudo choisi, seulement utile pour créer un compte.</param>
/// <param name="ExistingAccount">Le compte de cette adresse, s'il existe : on s'y connecte.</param>
/// <param name="PseudoTaken">Le pseudo demandé est déjà pris : pas de création de compte.</param>
/// <param name="GuestToConvert">
/// L'invité de ce navigateur, converti en compte s'il faut en créer un. Jamais un joueur qui a déjà un
/// compte (piège 30) : un navigateur connecté reçoit alors un nouveau joueur.
/// </param>
/// <param name="PreviousDeviceSession">La session de ce navigateur, révoquée par la connexion (S5).</param>
public sealed record AccountSignInPlan(
    string Email,
    string? Pseudo,
    AccountLookup? ExistingAccount,
    bool PseudoTaken,
    Guid? GuestToConvert,
    (Guid PlayerId, int DeviceSessionId)? PreviousDeviceSession)
{
    /// <summary>Le compte de cette adresse appartient à un joueur supprimé : pas de connexion.</summary>
    public bool AccountUnavailable => ExistingAccount is { PlayerDeleted: true };

    /// <summary>Pas de compte pour cette adresse, et pas encore de pseudo pour le créer.</summary>
    public bool NeedsPseudo => ExistingAccount is null && Pseudo is null;
}

/// <param name="Outcome"><c>Found</c> (compte existant) ou <c>Linked</c> (compte créé), comme le journal v1.</param>
public sealed record AccountSignInResult(Guid PlayerId, string Outcome);

/// <summary>
/// La connexion d'une adresse vérifiée, quel que soit le moyen de vérification (lien magique, dev-login
/// de l'hôte de test, plus tard Google) : la logique d'identité n'existe qu'ici (v1 :
/// <c>AccountLinkingService</c>). Rien n'est enregistré : la transaction est celle de l'appelant.
/// </summary>
public sealed class AccountSignIn(
    IPlayerStore store,
    ICurrentPlayer current,
    IPlayerSignIn signIn,
    IStreakGrants streakGrants,
    IDeviceSessionValidationCache validationCache,
    IHttpContextAccessor httpContext,
    TimeProvider time)
{
    public async Task<AccountSignInPlan> PrepareAsync(string email, string? pseudo, CancellationToken ct)
    {
        var existing = await store.FindAccountByEmailAsync(email, ct);
        var pseudoTaken = existing is null && pseudo is not null && await store.IsPseudoTakenAsync(pseudo, ct);

        Guid? guest = null;
        if (existing is null && current.PlayerId is { } playerId && !await store.HasAccountAsync(playerId, ct))
            guest = playerId;

        var previous = current is { PlayerId: { } id, DeviceSessionId: { } sessionId } ? (id, sessionId) : ((Guid, int)?)null;
        return new AccountSignInPlan(email, pseudo, existing, pseudoTaken, guest, previous);
    }

    /// <summary>
    /// Connecte le navigateur : compte existant, ou compte créé (invité converti, ou nouveau joueur) avec
    /// le gel offert ; puis nouvelle session d'appareil, nouveau cookie, et l'ancienne session de ce
    /// navigateur révoquée (S5).
    /// </summary>
    public async Task<AccountSignInResult> ExecuteAsync(AccountSignInPlan plan, CancellationToken ct)
    {
        if (plan.AccountUnavailable || plan.NeedsPseudo || plan.PseudoTaken)
            throw new InvalidOperationException("Connexion impossible : le plan aurait dû être refusé avant.");

        var now = time.GetUtcNow();
        Guid playerId;
        bool isAdmin;
        string outcome;
        if (plan.ExistingAccount is { } account)
        {
            (playerId, isAdmin, outcome) = (account.PlayerId, account.IsAdmin, "Found");
        }
        else
        {
            if (plan.GuestToConvert is { } guest)
            {
                playerId = guest;
            }
            else
            {
                var player = Player.CreateGuest(Guid.NewGuid(), now);
                store.Add(player);
                playerId = player.Id;
            }

            store.Add(Account.Create(playerId, plan.Email, plan.Pseudo!, now));
            await streakGrants.GrantAccountCreationFreezeAsync(playerId, ct);
            (isAdmin, outcome) = (false, "Linked");
        }

        var session = DeviceSession.Open(playerId, now, DeviceLabel.From(httpContext.HttpContext?.Request.Headers.UserAgent));
        await store.AddAsync(session, ct);

        if (plan.PreviousDeviceSession is { } previous)
        {
            (await store.FindDeviceSessionAsync(previous.DeviceSessionId, ct))?.Revoke(now);
            validationCache.Forget(previous.PlayerId, previous.DeviceSessionId);
        }

        await signIn.SignInAsync(playerId, session.Id, isAdmin);
        return new AccountSignInResult(playerId, outcome);
    }
}

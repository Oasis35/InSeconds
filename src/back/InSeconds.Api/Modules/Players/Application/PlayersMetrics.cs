using System.Diagnostics.Metrics;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>
/// Métriques OpenTelemetry des joueurs, lues par le tableau Grafana « Activité » (<c>deploy/grafana/</c>). Aucun identifiant de joueur en
/// étiquette. Noms côté Prometheus : <c>inseconds_players_guests_created_total</c>, <c>inseconds_players_sign_ins_total</c>,
/// <c>inseconds_players_accounts_erased_total</c>.
/// </summary>
public sealed class PlayersMetrics
{
    public const string MeterName = "InSeconds.Players";

    public const string GuestsCreatedName = "inseconds.players.guests_created";
    public const string SignInsName = "inseconds.players.sign_ins";
    public const string AccountsErasedName = "inseconds.players.accounts_erased";

    private readonly Counter<long> _guestsCreated;
    private readonly Counter<long> _signIns;
    private readonly Counter<long> _accountsErased;

    public PlayersMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _guestsCreated = meter.CreateCounter<long>(GuestsCreatedName, description: "Invités créés, par source d'arrivée (nettoyée : utm_source ou domaine du référent, direct, other).");
        _signIns = meter.CreateCounter<long>(SignInsName, description: "Connexions par lien magique : Found (compte existant) ou Linked (compte créé).");
        _accountsErased = meter.CreateCounter<long>(AccountsErasedName, description: "Comptes effacés : request (demande du joueur) ou inactive (purge).");
    }

    /// <param name="source">Déjà nettoyée par <see cref="Domain.AcquisitionSource"/> : un nombre limité de valeurs.</param>
    public void GuestCreated(string source) => _guestsCreated.Add(1, new KeyValuePair<string, object?>("source", source));

    public void SignedIn(string outcome) => _signIns.Add(1, new KeyValuePair<string, object?>("outcome", outcome));

    public void AccountErased(string reason) => _accountsErased.Add(1, new KeyValuePair<string, object?>("reason", reason));
}

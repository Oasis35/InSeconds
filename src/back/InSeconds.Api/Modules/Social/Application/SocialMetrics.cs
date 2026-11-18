using System.Diagnostics.Metrics;

namespace InSeconds.Api.Modules.Social.Application;

/// <summary>
/// Métriques OpenTelemetry des groupes et du classement général, pour le tableau Grafana « Activité ». Aucun identifiant de joueur ni de groupe en
/// étiquette, jamais un nom : seulement l'événement. Noms côté Prometheus : <c>inseconds_social_groups_total</c>,
/// <c>inseconds_social_ranking_visibility_total</c>.
/// </summary>
public sealed class SocialMetrics
{
    public const string MeterName = "InSeconds.Social";

    public const string GroupsName = "inseconds.social.groups";
    public const string RankingVisibilityName = "inseconds.social.ranking_visibility";

    /// <summary>Étiquette <c>event</c> des groupes : créé, rejoint, quitté, vidé par le départ du dernier membre, supprimé par son créateur ou par l'admin.</summary>
    public const string Created = "created";
    public const string Joined = "joined";
    public const string Left = "left";
    public const string Emptied = "emptied";
    public const string Deleted = "deleted";
    public const string AdminDeleted = "admin_deleted";

    private readonly Counter<long> _groups;
    private readonly Counter<long> _visibility;

    public SocialMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _groups = meter.CreateCounter<long>(GroupsName, description: "Événements des groupes entre amis, par événement (event).");
        _visibility = meter.CreateCounter<long>(RankingVisibilityName, description: "Choix d'apparaître au classement général ou non (visible).");
    }

    public void Group(string @event) => _groups.Add(1, new KeyValuePair<string, object?>("event", @event));

    public void RankingVisibilityChanged(bool visible) => _visibility.Add(1, new KeyValuePair<string, object?>("visible", visible));
}

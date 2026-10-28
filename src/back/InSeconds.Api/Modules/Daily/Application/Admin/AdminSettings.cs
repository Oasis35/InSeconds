using FluentValidation;
using InSeconds.Api.Infrastructure.Settings;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le cooldown des morceaux tel qu'il s'applique maintenant (#275).</summary>
/// <param name="TrackCooldownPoolPercent">La part du pool jouable en cooldown (cf. <see cref="DailyOptions.TrackCooldownPoolPercent"/>).</param>
/// <param name="TrackCooldownDays">Les jours de cooldown qui s'en déduisent aujourd'hui : un morceau tiré le jour J redevient tirable à J + jours + 1.</param>
/// <param name="PlayableTrackCount">Les morceaux jouables (non désactivés, extrait disponible), base du calcul.</param>
public sealed record AdminDailySettingsResponse(int TrackCooldownPoolPercent, int TrackCooldownDays, int PlayableTrackCount)
{
    public static AdminDailySettingsResponse From(TrackCooldownState state) => new(state.PoolPercent, state.Days, state.PlayableCount);
}

public static class GetAdminDailySettingsEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/daily/settings</c> : le cooldown en vigueur, calculé sur le pool d'aujourd'hui. Un réglage aberrant en base retombe
    /// sur la valeur par défaut, comme pour le tirage : on montre ce qui s'applique.
    /// </summary>
    [WolverineGet("/api/admin/daily/settings", OperationId = "getAdminDailySettings")]
    public static async Task<AdminDailySettingsResponse> Get(TrackCooldownPolicy cooldown, CancellationToken ct) =>
        AdminDailySettingsResponse.From(await cooldown.CurrentAsync(ct));
}

public sealed record UpdateTrackCooldownPoolPercent(int TrackCooldownPoolPercent);

public sealed class UpdateTrackCooldownPoolPercentValidator : AbstractValidator<UpdateTrackCooldownPoolPercent>
{
    public UpdateTrackCooldownPoolPercentValidator()
    {
        // Les bornes du réglage lu (DailyOptions.EffectiveTrackCooldownPoolPercent) : au-delà, le tirage l'ignorerait.
        RuleFor(x => x.TrackCooldownPoolPercent)
            .InclusiveBetween(DailyOptions.MinTrackCooldownPoolPercent, DailyOptions.MaxTrackCooldownPoolPercent);
    }
}

public static class UpdateTrackCooldownPoolPercentEndpoint
{
    /// <summary>
    /// <c>PUT /api/admin/daily/settings/track-cooldown-pool-percent</c> : change la part du pool en cooldown, et rend le cooldown qui en
    /// résulte. **Pris en compte tout de suite, sans redémarrage** : l'écriture recharge la source des réglages, et le tirage, l'usage des
    /// morceaux (date de déblocage du pool) et le contrôle nocturne des extraits relisent le réglage à chaque appel. Un défi déjà généré ne
    /// change pas. **Non transactionnelle** : le rechargement relit la base, il doit voir la ligne déjà enregistrée (dans la transaction de
    /// Wolverine, il lirait encore l'ancienne valeur).
    /// </summary>
    [NonTransactional]
    [WolverinePut("/api/admin/daily/settings/track-cooldown-pool-percent", OperationId = "updateTrackCooldownPoolPercent")]
    public static async Task<AdminDailySettingsResponse> Put(
        UpdateTrackCooldownPoolPercent request, [NotBody] SettingsStore settings, [NotBody] TrackCooldownPolicy cooldown, CancellationToken ct)
    {
        await settings.SetAsync($"{DailyOptions.Section}:{nameof(DailyOptions.TrackCooldownPoolPercent)}", request.TrackCooldownPoolPercent, ct);
        return AdminDailySettingsResponse.From(await cooldown.WithPoolPercentAsync(request.TrackCooldownPoolPercent, ct));
    }
}

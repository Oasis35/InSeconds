using FluentValidation;
using InSeconds.Api.Infrastructure.Settings;
using Microsoft.Extensions.Options;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Les réglages du défi du jour que l'admin modifie, tels qu'ils sont en vigueur maintenant.</summary>
/// <param name="TrackCooldownDays">Jours pendant lesquels un morceau tiré ne peut pas l'être de nouveau (cf. <see cref="DailyOptions.TrackCooldownDays"/>).</param>
public sealed record AdminDailySettingsResponse(int TrackCooldownDays);

public static class GetAdminDailySettingsEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/daily/settings</c> : le cooldown en vigueur (v1 : l'onglet Actions le lisait dans les réglages publics, que la v2 ne
    /// publie plus). Un réglage aberrant en base retombe sur la valeur par défaut, comme pour le tirage : on montre ce qui s'applique.
    /// </summary>
    [WolverineGet("/api/admin/daily/settings", OperationId = "getAdminDailySettings")]
    public static AdminDailySettingsResponse Get(IOptionsMonitor<DailyOptions> options) =>
        new(options.CurrentValue.EffectiveTrackCooldownDays);
}

public sealed record UpdateTrackCooldown(int TrackCooldownDays);

public sealed class UpdateTrackCooldownValidator : AbstractValidator<UpdateTrackCooldown>
{
    /// <summary>La limite haute du réglage lu (<see cref="DailyOptions.EffectiveTrackCooldownDays"/>) : au-delà, le tirage l'ignorerait.</summary>
    public const int MaxDays = 3650;

    public UpdateTrackCooldownValidator()
    {
        // v1 : strictement positif. Pas de 0 : ce serait un cooldown désactivé, sans intérêt pour un pool qui se vide.
        RuleFor(x => x.TrackCooldownDays).InclusiveBetween(1, MaxDays);
    }
}

public static class UpdateTrackCooldownEndpoint
{
    /// <summary>
    /// <c>PUT /api/admin/daily/settings/track-cooldown-days</c> (v1 : <c>PUT /api/admin/settings/track-cooldown-days</c>) : change le cooldown des
    /// morceaux. **Pris en compte tout de suite, sans redémarrage** : l'écriture recharge la source des réglages (R13), et le tirage, l'usage des
    /// morceaux (date de déblocage du pool) et le contrôle nocturne des extraits relisent le réglage à chaque appel. Un défi déjà généré ne change
    /// pas. **Non transactionnelle** : le rechargement relit la base, il doit voir la ligne déjà enregistrée (dans la transaction de Wolverine, il
    /// lirait encore l'ancienne valeur).
    /// </summary>
    [NonTransactional]
    [WolverinePut("/api/admin/daily/settings/track-cooldown-days", OperationId = "updateTrackCooldown")]
    public static async Task<AdminDailySettingsResponse> Put(UpdateTrackCooldown request, [NotBody] SettingsStore settings, CancellationToken ct)
    {
        await settings.SetAsync($"{DailyOptions.Section}:{nameof(DailyOptions.TrackCooldownDays)}", request.TrackCooldownDays, ct);
        return new AdminDailySettingsResponse(request.TrackCooldownDays);
    }
}

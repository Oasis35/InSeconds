using Microsoft.Extensions.DependencyInjection.Extensions;

namespace InSeconds.Api.Infrastructure.Time;

/// <summary>
/// Le calendrier du jeu : un jour de jeu est un jour UTC, qui commence à minuit UTC. Tout le code
/// passe par ici (ou par <see cref="TimeProvider"/>), jamais par <c>DateTime.UtcNow</c>, pour que
/// les tests puissent fixer l'heure (vérifié par un test d'architecture).
/// </summary>
public interface IGameCalendar
{
    DateTimeOffset Now { get; }

    /// <summary>Le jour de jeu en cours.</summary>
    DateOnly Today { get; }

    /// <summary>Minuit UTC au début de <paramref name="day"/>.</summary>
    DateTimeOffset StartOf(DateOnly day);
}

internal sealed class GameCalendar(TimeProvider time) : IGameCalendar
{
    public DateTimeOffset Now => time.GetUtcNow();

    public DateOnly Today => DateOnly.FromDateTime(Now.UtcDateTime);

    public DateTimeOffset StartOf(DateOnly day) => new(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
}

public static class GameCalendarServiceCollectionExtensions
{
    public static IServiceCollection AddGameCalendar(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<IGameCalendar, GameCalendar>();
        return services;
    }
}

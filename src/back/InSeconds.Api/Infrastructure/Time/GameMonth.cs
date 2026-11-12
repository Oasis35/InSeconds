using System.Globalization;

namespace InSeconds.Api.Infrastructure.Time;

/// <summary>Un mois de jeu (`aaaa-mm`, mois UTC) : l'écriture des routes d'historique, qui lisent un mois à la fois.</summary>
public static class GameMonth
{
    private const string Format = "yyyy-MM";

    /// <summary>Le premier jour du mois écrit `aaaa-mm` ; faux pour toute autre écriture.</summary>
    public static bool TryParse(string? month, out DateOnly first) =>
        DateOnly.TryParseExact(month, Format, CultureInfo.InvariantCulture, DateTimeStyles.None, out first);

    /// <summary>L'écriture `aaaa-mm` du mois de ce jour.</summary>
    public static string Of(DateOnly day) => day.ToString(Format, CultureInfo.InvariantCulture);

    /// <summary>Le premier jour du mois de ce jour.</summary>
    public static DateOnly FirstDayOf(DateOnly day) => new(day.Year, day.Month, 1);
}

using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;

namespace InSeconds.UnitTests.Daily;

public class ReturnCohortsTests
{
    private static readonly DateOnly Today = new(2026, 11, 25);

    private static PlayerArrival Arrival(Guid id, int daysAgo, string? source = "share", string? device = "phone") =>
        new(id, Today.AddDays(-daysAgo), source, device);

    private static Dictionary<Guid, IReadOnlyList<DateOnly>> Played(params (Guid Id, int[] DaysAgo)[] rows) =>
        rows.ToDictionary(r => r.Id, r => (IReadOnlyList<DateOnly>)r.DaysAgo.Select(d => Today.AddDays(-d)).ToList());

    [Fact]
    public void RetourAJ1_UneParticipationLeLendemain()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        var row = ReturnCohorts.Build("all", [Arrival(a, 5), Arrival(b, 5)], Played((a, [5, 4]), (b, [5])), Today);

        Assert.Equal(new CohortRow("all", 2, 2, 1, 0, 0), row);
    }

    [Fact]
    public void RetourAJ7_Exactement7JoursApres()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        var row = ReturnCohorts.Build("all", [Arrival(a, 10), Arrival(b, 10)], Played((a, [10, 3]), (b, [10, 4])), Today);

        Assert.Equal(1, row.Day7Returned);
        Assert.Equal(2, row.Day7Eligible);
    }

    [Fact]
    public void JourEnCours_NeComptePasDansLeRetour()
    {
        var yesterday = Guid.NewGuid();
        var today = Guid.NewGuid();
        var sixDaysAgo = Guid.NewGuid();

        var row = ReturnCohorts.Build("all", [Arrival(yesterday, 1), Arrival(today, 0), Arrival(sixDaysAgo, 6)], Played(), Today);

        // J+1 d'hier est aujourd'hui, pas encore fini ; J+1 de celui d'il y a 6 jours est terminé ; J+7 n'est fini pour personne.
        Assert.Equal(3, row.New);
        Assert.Equal(1, row.Day1Eligible);
        Assert.Equal(0, row.Day7Eligible);
    }

    [Fact]
    public void Groupes_ParValeur_LePlusNombreuxDAbord_SansValeurIgnore()
    {
        var ids = Enumerable.Range(0, 4).Select(_ => Guid.NewGuid()).ToArray();
        PlayerArrival[] arrivals =
        [
            Arrival(ids[0], 3, "instagram"), Arrival(ids[1], 3, "share"), Arrival(ids[2], 3, "share"), Arrival(ids[3], 3, null),
        ];

        var rows = ReturnCohorts.By(arrivals, Played(), Today, a => a.Source);

        Assert.Equal(["share", "instagram"], rows.Select(r => r.Key));
        Assert.Equal([2, 1], rows.Select(r => r.New));
    }
}

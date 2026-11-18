using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Les règles d'une playlist d'avant les règles d'équilibrage (manches de 5, ni vie regagnée, ni plafond, ni bonus) : les parties déjà créées les gardent figées.</summary>
internal static class TestRules
{
    public static RunRules Legacy() => new RunsOptions
    {
        TracksPerRound = 5,
        RegainLife = false,
        ShortenOnNoLifeLost = false,
        MaxRounds = 0,
        LifeBonus = 0,
        CompleteBonus = 0,
    }.ToRules();
}

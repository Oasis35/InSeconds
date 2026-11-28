using System.Diagnostics.Metrics;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.UnitTests.Daily;

/// <summary>Les points d'une réponse sont mesurés par palier écouté : de quoi voir où le barème fait gagner ou perdre.</summary>
public sealed class DailyMetricsAnswerScoreTests
{
    private sealed class TestMeterFactory : IMeterFactory
    {
        private readonly List<Meter> _meters = [];

        public Meter Create(MeterOptions options)
        {
            var meter = new Meter(options.Name, options.Version, options.Tags, scope: this);
            _meters.Add(meter);
            return meter;
        }

        public void Dispose() => _meters.ForEach(meter => meter.Dispose());
    }

    [Fact]
    public void ReponseEnregistree_PointsEtPalierEnEtiquette()
    {
        using var factory = new TestMeterFactory();
        var metrics = new DailyMetrics(factory);
        var recorded = new List<(int Score, string? Listened)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            // Un MeterListener voit les instruments de tout le processus : on ne garde que ceux de la fabrique de ce test.
            if (ReferenceEquals(instrument.Meter.Scope, factory) && instrument.Name == DailyMetrics.AnswerScoreName)
                l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<int>((_, value, tags, _) =>
            recorded.Add((value, tags.ToArray().Single(t => t.Key == "listened_seconds").Value as string)));
        listener.Start();

        metrics.AnswerSubmitted(new RoundOutcome(true, false, 1m, 0), 425);

        Assert.Equal([(425, "1")], recorded);
    }
}

/// <summary>Chaque série de compteur existe dès le démarrage : Prometheus ne compte pas le premier échantillon d'une série neuve.</summary>
public sealed class MetricsSeedTests
{
    private static List<(string Instrument, string Tag)> Seeds(Action<IMeterFactory> create)
    {
        using var factory = new TestFactory();
        var seen = new List<(string, string)>();
        using var listener = new MeterListener();
        // Un MeterListener voit les instruments de tout le processus, ceux des tests lancés en parallèle compris : sans ce
        // filtre, le rappel ci-dessous s'exécute sur leurs mesures et leurs threads, et son Assert y lève une exception.
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (ReferenceEquals(instrument.Meter.Scope, factory)) l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            Assert.Equal(0, value);
            seen.Add((instrument.Name, (string)tags.ToArray().Single().Value!));
        });
        listener.Start();
        create(factory);
        return seen;
    }

    private sealed class TestFactory : IMeterFactory
    {
        private readonly List<Meter> _meters = [];

        public Meter Create(MeterOptions options)
        {
            var meter = new Meter(options.Name, options.Version, options.Tags, scope: this);
            _meters.Add(meter);
            return meter;
        }

        public void Dispose() => _meters.ForEach(meter => meter.Dispose());
    }

    [Fact]
    public void Parties_UneSerieParEvenementDesLeDemarrage()
    {
        var seeds = Seeds(f => _ = new DailyMetrics(f));
        Assert.Equal(["abandoned", "completed", "expired", "started"], seeds.Select(s => s.Tag).Order());
    }

    [Fact]
    public void Joueurs_SourcesConnexionsEtEffacementsExistentDesLeDemarrage()
    {
        var seeds = Seeds(f => _ = new InSeconds.Api.Modules.Players.Application.PlayersMetrics(f));
        Assert.Contains(("inseconds.players.guests_created", "direct"), seeds);
        Assert.Contains(("inseconds.players.sign_ins", "Linked"), seeds);
        Assert.Contains(("inseconds.players.accounts_erased", "inactive"), seeds);
    }
}

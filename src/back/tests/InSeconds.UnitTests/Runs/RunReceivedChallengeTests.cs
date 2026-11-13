using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Le défi d'un ami reçu : sept jours de vie, un refus qui se garde.</summary>
public class RunReceivedChallengeTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Receive_ExpireSeptJoursPlusTard_SansRefus()
    {
        var received = RunReceivedChallenge.Receive(Guid.NewGuid(), 4, Now);

        Assert.Equal(Now, received.ReceivedAt);
        Assert.Equal(Now.AddDays(7), received.ExpiresAt);
        Assert.Null(received.DismissedAt);
    }

    [Fact]
    public void Dismiss_GardeLaPremiereDate()
    {
        var received = RunReceivedChallenge.Receive(Guid.NewGuid(), 4, Now);

        received.Dismiss(Now.AddHours(1));
        received.Dismiss(Now.AddHours(5));

        Assert.Equal(Now.AddHours(1), received.DismissedAt);
    }
}

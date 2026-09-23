using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Streak;
using InSeconds.Api.Domain;

namespace InSeconds.Api.UnitTests.Common.Streak;

public sealed class StreakDtoTests
{
    [Theory]
    [InlineData(StreakStatus.Active, "active")]
    [InlineData(StreakStatus.Protected, "protected")]
    [InlineData(StreakStatus.Broken, "broken")]
    public void From_SerialiseLeStatutEnMinuscules(StreakStatus status, string expected)
    {
        var view = new StreakView(status, 3, 1, 2, 7, 4, 0, null, null);

        StreakDto.From(view).Status.Should().Be(expected);
    }

    [Fact]
    public void From_RecopieTousLesChamps()
    {
        var lastPlayed = new DateOnly(2026, 9, 21);
        var view = new StreakView(StreakStatus.Protected, 12, 1, 2, 7, 2, 1, null, lastPlayed);

        var dto = StreakDto.From(view);

        dto.Should().Be(new StreakDto("protected", 12, 1, 2, 7, 2, 1, null, lastPlayed));
    }

    [Fact]
    public void None_SerieNulleSansGel()
    {
        StreakDto.None.Should().Be(new StreakDto("active", 0, 0, 0, 0, null, 0, null, null));
    }
}

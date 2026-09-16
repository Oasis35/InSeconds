using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;

namespace InSeconds.Api.UnitTests.Domain;

public sealed class PlayerTests
{
    private static Player BuildPlayer() =>
        Player.CreateGuest(Guid.NewGuid(), Guid.NewGuid(), DateTime.UtcNow);

    // ---------------------------------------------------------------------------
    // CreateGuest
    // ---------------------------------------------------------------------------

    [Fact]
    public void CreateGuest_SetsGuestFieldsAndLeavesIdentityEmpty()
    {
        var id = Guid.NewGuid();
        var authToken = Guid.NewGuid();
        var createdAt = DateTime.UtcNow;

        var player = Player.CreateGuest(id, authToken, createdAt);

        player.Id.Should().Be(id);
        player.AuthToken.Should().Be(authToken);
        player.CreatedAt.Should().Be(createdAt);
        player.IsGuest.Should().BeTrue();
        player.Pseudo.Should().BeNull();
        player.Email.Should().BeNull();
        player.IsAdmin.Should().BeFalse();
        player.IsDeleted.Should().BeFalse();
    }

    // ---------------------------------------------------------------------------
    // RecordChallengeCompletion — streak (cf. piège 18 CLAUDE.md racine)
    // ---------------------------------------------------------------------------

    [Fact]
    public void RecordChallengeCompletion_WhenLastPlayedWasChallengeDateMinusOneDay_IncrementsStreak()
    {
        var player = BuildPlayer();
        var challengeDate = DateOnly.FromDateTime(DateTime.UtcNow);
        player.RecordChallengeCompletion(challengeDate.AddDays(-1)); // streak = 1, LastPlayedDate = J-1

        player.RecordChallengeCompletion(challengeDate);

        player.CurrentStreak.Should().Be(2);
        player.LastPlayedDate.Should().Be(challengeDate);
    }

    [Fact]
    public void RecordChallengeCompletion_WhenGapSinceLastChallenge_ResetsStreakToOne()
    {
        var player = BuildPlayer();
        var challengeDate = DateOnly.FromDateTime(DateTime.UtcNow);
        player.RecordChallengeCompletion(challengeDate.AddDays(-5)); // streak = 1, LastPlayedDate = J-5

        player.RecordChallengeCompletion(challengeDate); // trou de plusieurs jours

        player.CurrentStreak.Should().Be(1);
        player.LastPlayedDate.Should().Be(challengeDate);
    }

    [Fact]
    public void RecordChallengeCompletion_WhenNoPriorCompletion_StartsStreakAtOne()
    {
        var player = BuildPlayer();
        var challengeDate = DateOnly.FromDateTime(DateTime.UtcNow);

        player.RecordChallengeCompletion(challengeDate);

        player.CurrentStreak.Should().Be(1);
        player.LastPlayedDate.Should().Be(challengeDate);
    }

    [Fact]
    public void RecordChallengeCompletion_StoresChallengeDate_NotUtcNow()
    {
        // Piège 18 : LastPlayedDate doit toujours prendre la date du DÉFI, jamais
        // DateTime.UtcNow — sinon terminer le défi de lundi mardi après minuit casse la streak.
        var player = BuildPlayer();
        var challengeDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);

        player.RecordChallengeCompletion(challengeDate);

        player.LastPlayedDate.Should().Be(challengeDate);
        player.LastPlayedDate.Should().NotBe(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    // ---------------------------------------------------------------------------
    // LinkToAccount / UpdatePseudo / ChangeEmail
    // ---------------------------------------------------------------------------

    [Fact]
    public void LinkToAccount_ConvertsGuestToLinkedAccount()
    {
        var player = BuildPlayer();

        player.LinkToAccount("player@example.com", "PlayerPseudo");

        player.IsGuest.Should().BeFalse();
        player.Email.Should().Be("player@example.com");
        player.Pseudo.Should().Be("PlayerPseudo");
    }

    [Fact]
    public void UpdatePseudo_ChangesPseudoOnly()
    {
        var player = BuildPlayer();
        player.LinkToAccount("player@example.com", "Original");

        player.UpdatePseudo("Renamed");

        player.Pseudo.Should().Be("Renamed");
        player.Email.Should().Be("player@example.com");
    }

    [Fact]
    public void ChangeEmail_ChangesEmailOnly()
    {
        var player = BuildPlayer();
        player.LinkToAccount("old@example.com", "PlayerPseudo");

        player.ChangeEmail("new@example.com");

        player.Email.Should().Be("new@example.com");
        player.Pseudo.Should().Be("PlayerPseudo");
    }

    // ---------------------------------------------------------------------------
    // Delete
    // ---------------------------------------------------------------------------

    [Fact]
    public void Delete_SetsIsDeletedAndDeletedAt()
    {
        var player = BuildPlayer();
        var deletedAt = DateTime.UtcNow;

        player.Delete(deletedAt);

        player.IsDeleted.Should().BeTrue();
        player.DeletedAt.Should().Be(deletedAt);
    }

    // ---------------------------------------------------------------------------
    // RecordSeen
    // ---------------------------------------------------------------------------

    [Fact]
    public void RecordSeen_SetsLastSeenAt()
    {
        var player = BuildPlayer();
        var now = DateTime.UtcNow;

        player.RecordSeen(now);

        player.LastSeenAt.Should().Be(now);
    }
}

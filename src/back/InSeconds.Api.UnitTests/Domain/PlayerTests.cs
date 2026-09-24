using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;

namespace InSeconds.Api.UnitTests.Domain;

public sealed class PlayerTests
{
    private static readonly StreakRules Rules = new(FreezeEveryDays: 7, FreezeMax: 2, LostNudgeMinDays: 2);
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    private static Player BuildPlayer() =>
        Player.CreateGuest(Guid.NewGuid(), Guid.NewGuid(), DateTime.UtcNow);

    private static Player BuildLinkedPlayer(int streak, int lastPlayedDaysAgo, int freezes)
    {
        var player = BuildPlayer();
        player.LinkToAccount("player@example.com", "PlayerPseudo");
        player.RestoreStreakForTesting(streak, Today.AddDays(-lastPlayedDaysAgo), freezes);
        return player;
    }

    private static Player BuildGuestPlayer(int streak, int lastPlayedDaysAgo)
    {
        var player = BuildPlayer();
        player.RestoreStreakForTesting(streak, Today.AddDays(-lastPlayedDaysAgo));
        return player;
    }

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
        player.RecordChallengeCompletion(challengeDate.AddDays(-1), Rules); // streak = 1, LastPlayedDate = J-1

        player.RecordChallengeCompletion(challengeDate, Rules);

        player.CurrentStreak.Should().Be(2);
        player.LastPlayedDate.Should().Be(challengeDate);
    }

    [Fact]
    public void RecordChallengeCompletion_WhenGapSinceLastChallenge_ResetsStreakToOne()
    {
        var player = BuildPlayer();
        var challengeDate = DateOnly.FromDateTime(DateTime.UtcNow);
        player.RecordChallengeCompletion(challengeDate.AddDays(-5), Rules); // streak = 1, LastPlayedDate = J-5

        player.RecordChallengeCompletion(challengeDate, Rules); // trou de plusieurs jours

        player.CurrentStreak.Should().Be(1);
        player.LastPlayedDate.Should().Be(challengeDate);
    }

    [Fact]
    public void RecordChallengeCompletion_WhenNoPriorCompletion_StartsStreakAtOne()
    {
        var player = BuildPlayer();
        var challengeDate = DateOnly.FromDateTime(DateTime.UtcNow);

        player.RecordChallengeCompletion(challengeDate, Rules);

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

        player.RecordChallengeCompletion(challengeDate, Rules);

        player.LastPlayedDate.Should().Be(challengeDate);
        player.LastPlayedDate.Should().NotBe(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    // ---------------------------------------------------------------------------
    // RecordChallengeCompletion — gel de série
    // ---------------------------------------------------------------------------

    [Fact]
    public void RecordChallengeCompletion_LinkedWithOneMissedDayAndOneFreeze_ConsumesFreezeAndContinues()
    {
        var player = BuildLinkedPlayer(streak: 12, lastPlayedDaysAgo: 2, freezes: 1);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.CurrentStreak.Should().Be(13);
        player.StreakFreezes.Should().Be(0);
        result.FreezesUsed.Should().Be(1);
        result.FreezeEarned.Should().BeFalse();
    }

    [Fact]
    public void RecordChallengeCompletion_LinkedWithTwoMissedDaysAndTwoFreezes_ConsumesBoth()
    {
        var player = BuildLinkedPlayer(streak: 5, lastPlayedDaysAgo: 3, freezes: 2);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.CurrentStreak.Should().Be(6);
        player.StreakFreezes.Should().Be(0);
        result.FreezesUsed.Should().Be(2);
    }

    [Fact]
    public void RecordChallengeCompletion_LinkedWithMoreMissedDaysThanFreezes_ResetsAndKeepsFreezes()
    {
        var player = BuildLinkedPlayer(streak: 5, lastPlayedDaysAgo: 3, freezes: 1);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.CurrentStreak.Should().Be(1);
        player.StreakFreezes.Should().Be(1);
        result.FreezesUsed.Should().Be(0);
    }

    [Fact]
    public void RecordChallengeCompletion_GuestWithMissedDay_NeverUsesFreeze()
    {
        var player = BuildGuestPlayer(streak: 5, lastPlayedDaysAgo: 2);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.CurrentStreak.Should().Be(1);
        result.FreezesUsed.Should().Be(0);
        player.StreakFreezes.Should().Be(0);
    }

    [Fact]
    public void RecordChallengeCompletion_LinkedReachingMultipleOfSeven_EarnsFreeze()
    {
        var player = BuildLinkedPlayer(streak: 13, lastPlayedDaysAgo: 1, freezes: 1);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.CurrentStreak.Should().Be(14);
        player.StreakFreezes.Should().Be(2);
        result.FreezeEarned.Should().BeTrue();
    }

    [Fact]
    public void RecordChallengeCompletion_LinkedReachingMultipleOfSevenWithFullStock_EarnsNothing()
    {
        var player = BuildLinkedPlayer(streak: 13, lastPlayedDaysAgo: 1, freezes: 2);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.StreakFreezes.Should().Be(2);
        result.FreezeEarned.Should().BeFalse();
    }

    [Fact]
    public void RecordChallengeCompletion_GuestReachingMultipleOfSeven_EarnsNothing()
    {
        var player = BuildGuestPlayer(streak: 6, lastPlayedDaysAgo: 1);

        var result = player.RecordChallengeCompletion(Today, Rules);

        player.CurrentStreak.Should().Be(7);
        player.StreakFreezes.Should().Be(0);
        result.FreezeEarned.Should().BeFalse();
    }

    // ---------------------------------------------------------------------------
    // GetStreakView
    // ---------------------------------------------------------------------------

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void GetStreakView_WhenNoMissedDay_IsActive(int lastPlayedDaysAgo)
    {
        var player = BuildLinkedPlayer(streak: 12, lastPlayedDaysAgo, freezes: 2);

        var view = player.GetStreakView(Today, Rules);

        view.Status.Should().Be(StreakStatus.Active);
        view.Streak.Should().Be(12);
        view.Freezes.Should().Be(2);
        view.MaxFreezes.Should().Be(2);
        view.MissedDays.Should().Be(0);
        view.NextFreezeInDays.Should().Be(2);
        view.LostStreak.Should().BeNull();
    }

    [Fact]
    public void GetStreakView_LinkedWithMissedDaysCoveredByFreezes_IsProtected()
    {
        var player = BuildLinkedPlayer(streak: 12, lastPlayedDaysAgo: 2, freezes: 1);

        var view = player.GetStreakView(Today, Rules);

        view.Status.Should().Be(StreakStatus.Protected);
        view.Streak.Should().Be(12);
        view.MissedDays.Should().Be(1);
    }

    [Fact]
    public void GetStreakView_LinkedWithMissedDaysNotCovered_IsBrokenWithoutLostStreak()
    {
        var player = BuildLinkedPlayer(streak: 12, lastPlayedDaysAgo: 4, freezes: 2);

        var view = player.GetStreakView(Today, Rules);

        view.Status.Should().Be(StreakStatus.Broken);
        view.Streak.Should().Be(0);
        view.LostStreak.Should().BeNull();
        view.NextFreezeInDays.Should().Be(7);
    }

    [Fact]
    public void GetStreakView_GuestWithMissedDayAboveThreshold_ExposesLostStreak()
    {
        var player = BuildGuestPlayer(streak: 6, lastPlayedDaysAgo: 2);

        var view = player.GetStreakView(Today, Rules);

        view.Status.Should().Be(StreakStatus.Broken);
        view.Streak.Should().Be(0);
        view.LostStreak.Should().Be(6);
        view.Freezes.Should().Be(0);
        view.MaxFreezes.Should().Be(0);
        view.NextFreezeInDays.Should().BeNull();
    }

    [Fact]
    public void GetStreakView_GuestWithLostStreakBelowThreshold_HasNoLostStreak()
    {
        var player = BuildGuestPlayer(streak: 1, lastPlayedDaysAgo: 3);

        var view = player.GetStreakView(Today, Rules);

        view.Status.Should().Be(StreakStatus.Broken);
        view.LostStreak.Should().BeNull();
    }

    [Fact]
    public void GetStreakView_WhenNeverPlayed_IsActiveAtZero()
    {
        var view = BuildPlayer().GetStreakView(Today, Rules);

        view.Status.Should().Be(StreakStatus.Active);
        view.Streak.Should().Be(0);
        view.LastPlayedDate.Should().BeNull();
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
    public void LinkToAccount_GrantsSignupFreeze()
    {
        var player = BuildPlayer();

        player.LinkToAccount("player@example.com", "PlayerPseudo");

        player.StreakFreezes.Should().Be(Player.SignupFreezeGift);
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

using InSeconds.Api.Infrastructure.Hosting;

namespace InSeconds.MigrationTests;

/// <summary>Partie Daily de l'import (§ 8.2, 8.5 et 8.6 du plan v2), par le vrai <c>run-import.sh</c>.</summary>
public class DailyImportTests(ImportDatabase database)
{
    private static readonly DateOnly Day = new(2026, 9, 1);
    private static readonly DateTimeOffset Started = new(2026, 9, 1, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Finished = new(2026, 9, 1, 9, 3, 30, TimeSpan.Zero);

    // Le défi 5, de trois morceaux. Les identifiants v1 des morceaux du défi ne suivent pas les positions : 30 est la position 1,
    // 10 la position 2, 20 la position 3 (la clé v2 est (défi, position), jamais cet identifiant).
    private const int ChallengeId = 5;
    private const int AtPosition1 = 30;
    private const int AtPosition2 = 10;
    private const int AtPosition3 = 20;

    [Fact]
    public async Task Defis_ReprisAvecLeursMorceaux_IdentifiantsPositionsEtOrigine()
    {
        var cs = await database.CreateDatabaseAsync();
        await SeedChallengeAsync(cs);
        // Un second défi, d'identifiant non contigu, qui reprend le morceau 1 (il a été tiré deux fois : le cooldown l'a laissé revenir).
        await V1Data.InsertTracksAsync(cs, new V1Track(4, 104) { LastUsedDate = Day.AddDays(40), UsageCount = 1 });
        await ImportDatabase.ExecuteAsync(cs, """UPDATE public."Tracks" SET "LastUsedDate" = '2026-10-11', "UsageCount" = 2 WHERE "Id" = 1""");
        await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(42, Day.AddDays(40)) { Seed = 99 });
        await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(77, 42, 1, 1), new V1ChallengeTrack(78, 42, 4, 2));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(2L, await Count(cs, "daily.challenges"));
        Assert.Equal(1L, await Count(cs, $"daily.challenges WHERE id = {ChallengeId} AND date = '2026-09-01' AND seed = 7 AND origin IS NULL"));
        Assert.Equal(1L, await Count(cs, "daily.challenges WHERE id = 42 AND date = '2026-10-11' AND seed = 99 AND origin IS NULL"));
        Assert.Equal(5L, await Count(cs, "daily.challenge_tracks"));
        Assert.Equal(1L, await Count(cs, $"daily.challenge_tracks WHERE challenge_id = {ChallengeId} AND position = 1 AND track_id = 1"));
        Assert.Equal(1L, await Count(cs, $"daily.challenge_tracks WHERE challenge_id = {ChallengeId} AND position = 2 AND track_id = 2"));
        Assert.Equal(1L, await Count(cs, $"daily.challenge_tracks WHERE challenge_id = {ChallengeId} AND position = 3 AND track_id = 3"));
        Assert.Equal(1L, await Count(cs, "daily.challenge_tracks WHERE challenge_id = 42 AND position = 2 AND track_id = 4"));
    }

    [Fact]
    public async Task PartieTerminee_ReprisesAvecSesReponsesRangeesParPosition()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest();
        await V1Data.InsertAsync(cs, player);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(8, player.Id, ChallengeId)
        {
            Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 2000, TotalDurationSeconds = 4.5m, FreezesUsed = 1, FreezeEarned = true,
        });
        await V1DailyData.InsertAnswersAsync(cs,
            new V1Answer(1, 8, AtPosition1) { ListenedDurationSeconds = 1m, Score = 850 },
            new V1Answer(2, 8, AtPosition2) { ListenedDurationSeconds = 1.5m, Score = 700, WasExtended = true, HintLevelUsed = 1, TitleCorrect = false, TitleAnswer = null },
            new V1Answer(3, 8, AtPosition3) { ListenedDurationSeconds = 2m, Score = 450, ArtistAnswer = "L'Impératrice", TitleAnswer = "Vagues" });

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs,
            $"daily.sessions WHERE id = 8 AND player_id = '{player.Id}' AND challenge_id = {ChallengeId} AND status = 1 AND started_at = {V1Data.Sql(Started)} " +
            $"AND ended_at = {V1Data.Sql(Finished)} AND total_score = 2000 AND total_listened_seconds = 4.5 AND current_position IS NULL " +
            "AND current_listened_seconds IS NULL AND current_hint_level = 0 AND freezes_used = 1 AND freeze_earned"));
        Assert.Equal(3L, await Count(cs, "daily.answers WHERE session_id = 8 AND answered_at IS NULL"));
        // Chaque réponse est rangée à la position de son morceau, pas à l'ordre des identifiants v1.
        Assert.Equal(1L, await Count(cs, "daily.answers WHERE session_id = 8 AND position = 1 AND listened_seconds = 1 AND score = 850 AND NOT was_extended AND hint_level = 0 AND artist_correct AND title_correct AND artist_answer = 'Daft Punk' AND title_answer = 'One More Time'"));
        Assert.Equal(1L, await Count(cs, "daily.answers WHERE session_id = 8 AND position = 2 AND listened_seconds = 1.5 AND score = 700 AND was_extended AND hint_level = 1 AND artist_correct AND NOT title_correct AND title_answer IS NULL"));
        Assert.Equal(1L, await Count(cs, "daily.answers WHERE session_id = 8 AND position = 3 AND listened_seconds = 2 AND score = 450 AND artist_answer = 'L''Impératrice' AND title_answer = 'Vagues'"));
    }

    [Fact]
    public async Task PartieAbandonneeEtExpiree_FinDeLAbandon_VerrouDEnregistreTelQuel()
    {
        var cs = await database.CreateDatabaseAsync();
        var (abandoner, expirer) = (V1Player.Guest(), V1Player.Guest());
        await V1Data.InsertAsync(cs, abandoner, expirer);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs,
            // L'abandon ne libère pas le verrou en v1 : il est repris tel quel, la v2 ne le lit que pour une partie en cours.
            new V1Session(1, abandoner.Id, ChallengeId) { Status = 2, CreatedAt = Started, AbandonedAt = Finished, CurrentTrackId = AtPosition2, CurrentTrackMinListenedSeconds = 2m, CurrentTrackHintLevelUsed = 1 },
            new V1Session(2, expirer.Id, ChallengeId) { Status = 3, CreatedAt = Started, AbandonedAt = Finished.AddDays(1) });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 1, AtPosition1));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs,
            $"daily.sessions WHERE id = 1 AND status = 2 AND ended_at = {V1Data.Sql(Finished)} AND current_position = 2 AND current_listened_seconds = 2 AND current_hint_level = 1"));
        Assert.Equal(1L, await Count(cs, $"daily.sessions WHERE id = 2 AND status = 3 AND ended_at = {V1Data.Sql(Finished.AddDays(1))}"));
        Assert.Equal(1L, await Count(cs, "daily.answers WHERE session_id = 1"));
    }

    [Fact]
    public async Task PartieEnCours_AvecVerrouEtIndice_ResteEnCoursSurLeMorceauVerrouille()
    {
        var cs = await database.CreateDatabaseAsync();
        var (locked, unlocked, fresh) = (V1Player.Guest(), V1Player.Guest(), V1Player.Guest());
        await V1Data.InsertAsync(cs, locked, unlocked, fresh);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs,
            // Un morceau répondu, le deuxième écouté 1,5 s avec un indice de niveau 1 : le verrou est sur la position 2.
            new V1Session(1, locked.Id, ChallengeId) { CreatedAt = Started, TotalScore = 850, TotalDurationSeconds = 1m, CurrentTrackId = AtPosition2, CurrentTrackMinListenedSeconds = 1.5m, CurrentTrackHintLevelUsed = 1 },
            // Un morceau répondu, aucun verrou (le joueur n'a rien écouté sur le suivant).
            new V1Session(2, unlocked.Id, ChallengeId) { CreatedAt = Started, TotalScore = 850, TotalDurationSeconds = 1m },
            // Aucune réponse, premier morceau déjà écouté.
            new V1Session(3, fresh.Id, ChallengeId) { CreatedAt = Started, CurrentTrackId = AtPosition1, CurrentTrackMinListenedSeconds = 0.5m });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 1, AtPosition1), new V1Answer(2, 2, AtPosition1));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs, "daily.sessions WHERE id = 1 AND status = 0 AND ended_at IS NULL AND current_position = 2 AND current_listened_seconds = 1.5 AND current_hint_level = 1"));
        Assert.Equal(1L, await Count(cs, "daily.sessions WHERE id = 2 AND status = 0 AND current_position IS NULL AND current_listened_seconds IS NULL AND current_hint_level = 0"));
        Assert.Equal(1L, await Count(cs, "daily.sessions WHERE id = 3 AND status = 0 AND current_position = 1 AND current_listened_seconds = 0.5"));
        Assert.Contains("reprises en « expirées » : 0", result.Output, StringComparison.Ordinal);
        Assert.Contains("Verrous de morceau écartés (hors du défi, ou pas sur le morceau en cours) : 0", result.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PartieEnCours_AuxReponsesNonContigues_EstReprise_Expiree_ReponsesGardees()
    {
        // La v1 n'imposait l'ordre des morceaux que si le verrou était posé : des réponses 1 et 3 sans la 2 existent par l'API.
        // En v2, « le morceau en cours est le premier sans réponse » (piège 35) : cette partie ne peut plus continuer.
        var cs = await database.CreateDatabaseAsync();
        var (gap, full) = (V1Player.Guest(), V1Player.Guest());
        await V1Data.InsertAsync(cs, gap, full);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs,
            new V1Session(1, gap.Id, ChallengeId) { CreatedAt = Started, TotalScore = 1700, TotalDurationSeconds = 2m, CurrentTrackId = AtPosition2, CurrentTrackMinListenedSeconds = 1m, CurrentTrackHintLevelUsed = 1 },
            // Toutes les réponses données mais jamais terminée : plus aucun morceau à jouer.
            new V1Session(2, full.Id, ChallengeId) { CreatedAt = Started, TotalScore = 2550, TotalDurationSeconds = 3m });
        await V1DailyData.InsertAnswersAsync(cs,
            new V1Answer(1, 1, AtPosition1), new V1Answer(2, 1, AtPosition3),
            new V1Answer(3, 2, AtPosition1), new V1Answer(4, 2, AtPosition2), new V1Answer(5, 2, AtPosition3));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Contains("reprises en « expirées » : 2", result.Output, StringComparison.Ordinal);
        Assert.Equal(1L, await Count(cs, "daily.sessions WHERE id = 1 AND status = 3 AND ended_at > now() - interval '1 hour' AND total_score = 1700 AND current_position IS NULL AND current_listened_seconds IS NULL AND current_hint_level = 0"));
        Assert.Equal(1L, await Count(cs, "daily.sessions WHERE id = 2 AND status = 3 AND total_score = 2550"));
        Assert.Equal(5L, await Count(cs, "daily.answers"));
        Assert.Equal(1L, await Count(cs, "daily.answers WHERE session_id = 1 AND position = 3"));
    }

    [Fact]
    public async Task PartieEnCours_VerrouSurUnAutreMorceauQueLeMorceauEnCours_VerrouEcarte()
    {
        var cs = await database.CreateDatabaseAsync();
        var (elsewhere, outside) = (V1Player.Guest(), V1Player.Guest());
        await V1Data.InsertAsync(cs, elsewhere, outside);
        await SeedChallengeAsync(cs);
        await V1Data.InsertTracksAsync(cs, new V1Track(9, 109) { LastUsedDate = Day.AddDays(1), UsageCount = 1 });
        await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(6, Day.AddDays(1)));
        await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(60, 6, 9, 1));
        await V1DailyData.InsertSessionsAsync(cs,
            // Un morceau répondu, le verrou posé sur le troisième : la v2 ignorerait ce verrou, la partie reprend au deuxième.
            new V1Session(1, elsewhere.Id, ChallengeId) { CreatedAt = Started, CurrentTrackId = AtPosition3, CurrentTrackMinListenedSeconds = 2m, CurrentTrackHintLevelUsed = 2 },
            // Un verrou sur un morceau d'un autre défi (donnée incohérente) : écarté aussi.
            new V1Session(2, outside.Id, ChallengeId) { CreatedAt = Started, CurrentTrackId = 60, CurrentTrackMinListenedSeconds = 2m });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 1, AtPosition1));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Contains("Verrous de morceau écartés (hors du défi, ou pas sur le morceau en cours) : 2", result.Output, StringComparison.Ordinal);
        Assert.Equal(2L, await Count(cs, "daily.sessions WHERE status = 0 AND current_position IS NULL AND current_listened_seconds IS NULL AND current_hint_level = 0"));
    }

    [Fact]
    public async Task PartiesDUnJoueurSupprime_Reprises_LesStatsLesExcluentALaLecture()
    {
        var cs = await database.CreateDatabaseAsync();
        var gone = V1Player.Account("parti@example.com", "Parti") with { IsDeleted = true, DeletedAt = Finished, LastSeenAt = Finished };
        await V1Data.InsertAsync(cs, gone);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(1, gone.Id, ChallengeId) { Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 850, TotalDurationSeconds = 1m });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 1, AtPosition1));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(1L, await Count(cs, "daily.sessions"));
        Assert.Equal(1L, await Count(cs, "daily.answers"));
    }

    [Fact]
    public async Task Series_UneLignePourQuiAUneSerieUneDateOuUnGel_ValeursBrutes()
    {
        var cs = await database.CreateDatabaseAsync();
        var none = V1Player.Guest();
        var streak = V1Player.Guest() with { CurrentStreak = 4, LastPlayedDate = new DateOnly(2026, 9, 29), StreakFreezes = 1 };
        var freezesOnly = V1Player.Account("gel@example.com", "Gel") with { StreakFreezes = 2 };
        var broken = V1Player.Guest() with { CurrentStreak = 0, LastPlayedDate = new DateOnly(2026, 8, 1) };
        var deleted = V1Player.Guest() with { CurrentStreak = 3, LastPlayedDate = new DateOnly(2026, 9, 30), IsDeleted = true, DeletedAt = Finished };
        await V1Data.InsertAsync(cs, none, streak, freezesOnly, broken, deleted);

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(4L, await Count(cs, "daily.streaks"));
        Assert.Equal(0L, await Count(cs, $"daily.streaks WHERE player_id = '{none.Id}'"));
        Assert.Equal(1L, await Count(cs, $"daily.streaks WHERE player_id = '{streak.Id}' AND current_streak = 4 AND last_played_date = '2026-09-29' AND freezes = 1"));
        Assert.Equal(1L, await Count(cs, $"daily.streaks WHERE player_id = '{freezesOnly.Id}' AND current_streak = 0 AND last_played_date IS NULL AND freezes = 2"));
        Assert.Equal(1L, await Count(cs, $"daily.streaks WHERE player_id = '{broken.Id}' AND current_streak = 0 AND last_played_date = '2026-08-01' AND freezes = 0"));
        Assert.Equal(1L, await Count(cs, $"daily.streaks WHERE player_id = '{deleted.Id}' AND current_streak = 3"));
    }

    [Fact]
    public async Task Sequences_RecaleesApresLePlusGrandIdentifiant()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest();
        await V1Data.InsertAsync(cs, player);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(731, player.Id, ChallengeId) { CreatedAt = Started });

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        // Le premier lot tiré par la v2 ne recouvre aucun identifiant importé : sans cela, la première partie ou le premier défi
        // créés en v2 prendraient celui d'une ligne de la v1 (conflit sur la clé primaire).
        Assert.Equal(732L, await ImportDatabase.ScalarAsync<long>(cs, "SELECT nextval('daily.sessions_hilo')"));
        Assert.Equal(ChallengeId + 1L, await ImportDatabase.ScalarAsync<long>(cs, "SELECT nextval('daily.challenges_hilo')"));
    }

    [Fact]
    public async Task HistoriqueVide_ImportPasse_SequencesAuDebut()
    {
        var cs = await database.CreateDatabaseAsync();

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
        Assert.Equal(0L, await Count(cs, "daily.challenges"));
        Assert.Equal(1L, await ImportDatabase.ScalarAsync<long>(cs, "SELECT nextval('daily.sessions_hilo')"));
        Assert.Equal(1L, await ImportDatabase.ScalarAsync<long>(cs, "SELECT nextval('daily.challenges_hilo')"));
    }

    [Fact]
    public async Task Rejouable_RemetLHistoriqueDansLEtatDeLaV1()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest();
        await V1Data.InsertAsync(cs, player);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(1, player.Id, ChallengeId) { CreatedAt = Started, TotalScore = 850, TotalDurationSeconds = 1m });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 1, AtPosition1));
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);

        // Entre deux imports : une partie jouée en v2 (même défi, autre joueur), la partie importée modifiée en v2, une photo figée.
        await ImportDatabase.ExecuteAsync(cs, $"""
            INSERT INTO players.players (id, created_at) VALUES ('22222222-2222-2222-2222-222222222222', now());
            INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, total_score, total_listened_seconds)
                VALUES (500, '22222222-2222-2222-2222-222222222222', {ChallengeId}, 1, now(), 100, 1);
            UPDATE daily.sessions SET total_score = 5 WHERE id = 1;
            INSERT INTO daily.challenge_day_stats (challenge_id, computed_at, version, payload) VALUES ({ChallengeId}, now(), 1, '[]');
            """);
        var second = await database.RunImportAsync(cs);

        Assert.True(second.ExitCode == 0, second.Output);
        Assert.Equal(1L, await Count(cs, "daily.sessions"));
        Assert.Equal(1L, await Count(cs, "daily.sessions WHERE id = 1 AND total_score = 850"));
        Assert.Equal(0L, await Count(cs, "daily.challenge_day_stats"));
    }

    [Fact]
    public async Task Cooldown_RecalculeDepuisLesDefis_EgalAuxColonnesDeLaV1()
    {
        var cs = await database.CreateDatabaseAsync();
        // Le morceau 1 est tiré deux fois, le 2 une fois, le 3 jamais : ni date ni compteur.
        await V1Data.InsertTracksAsync(cs,
            new V1Track(1, 101) { LastUsedDate = Day.AddDays(40), UsageCount = 2 },
            new V1Track(2, 102) { LastUsedDate = Day, UsageCount = 1 },
            new V1Track(3, 103));
        await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(1, Day), new V1Challenge(2, Day.AddDays(40)));
        await V1DailyData.InsertChallengeTracksAsync(cs,
            new V1ChallengeTrack(1, 1, 1, 1), new V1ChallengeTrack(2, 1, 2, 2), new V1ChallengeTrack(3, 2, 1, 1));

        var result = await database.RunImportAsync(cs);

        Assert.True(result.ExitCode == 0, result.Output);
    }

    [Theory]
    [InlineData("""UPDATE public."Tracks" SET "UsageCount" = 5 WHERE "Id" = 1""")]
    [InlineData("""UPDATE public."Tracks" SET "LastUsedDate" = '2026-01-01' WHERE "Id" = 1""")]
    [InlineData("""UPDATE public."Tracks" SET "UsageCount" = 1 WHERE "Id" = 3""")]
    [InlineData("""UPDATE public."Tracks" SET "LastUsedDate" = NULL WHERE "Id" = 2""")]
    public async Task Cooldown_ColonneDeLaV1QuiDiffereDuCalcul_ImportRefuse(string tampering)
    {
        var cs = await database.CreateDatabaseAsync();
        await V1Data.InsertTracksAsync(cs,
            new V1Track(1, 101) { LastUsedDate = Day, UsageCount = 1 },
            new V1Track(2, 102) { LastUsedDate = Day, UsageCount = 1 },
            new V1Track(3, 103));
        await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(1, Day));
        await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(1, 1, 1, 1), new V1ChallengeTrack(2, 1, 2, 2));
        await ImportDatabase.ExecuteAsync(cs, tampering);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("cooldown : dernière date et nombre d'utilisations recalculés", result.Output, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "daily.challenges"));
    }

    [Fact]
    public async Task RangDeezerFigeDifferentDeLaPosition_ImportRefuse()
    {
        // La colonne abandonnée est vérifiée avant d'être perdue : si elle portait autre chose que la position, on s'arrête.
        var cs = await database.CreateDatabaseAsync();
        await SeedChallengeAsync(cs);
        await ImportDatabase.ExecuteAsync(cs, """UPDATE public."DailyChallengeTracks" SET "DeezerRankSnapshot" = 42 WHERE "Id" = 10""");

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("rang Deezer figé = position (colonne abandonnée)", result.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReponseSurUnMorceauDUnAutreDefi_ImportRefuse_PartieNommee()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest();
        await V1Data.InsertAsync(cs, player);
        await SeedChallengeAsync(cs);
        await V1Data.InsertTracksAsync(cs, new V1Track(9, 109) { LastUsedDate = Day.AddDays(1), UsageCount = 1 });
        await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(6, Day.AddDays(1)));
        await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(60, 6, 9, 1));
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(17, player.Id, ChallengeId) { CreatedAt = Started });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 17, 60));

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Réponses sur un morceau d'un autre défi que celui de leur partie, parties : 17", result.Output, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "daily.challenges"));
    }

    [Theory]
    [InlineData("""UPDATE public."GameSessionAnswers" SET "ListenedDurationSeconds" = 100 WHERE "Id" = 1""")]
    [InlineData("""UPDATE public."GameSessionAnswers" SET "ListenedDurationSeconds" = 1.234 WHERE "Id" = 1""")]
    [InlineData("""UPDATE public."GameSessions" SET "TotalDurationSeconds" = 10000 WHERE "Id" = 17""")]
    [InlineData("""UPDATE public."GameSessions" SET "CurrentTrackMinListenedSeconds" = 150 WHERE "Id" = 17""")]
    [InlineData("""UPDATE public."GameSessions" SET "FreezesUsed" = 40000 WHERE "Id" = 17""")]
    [InlineData("""UPDATE public."GameSessions" SET "Status" = 7 WHERE "Id" = 17""")]
    public async Task ValeurHorsDesLimitesDesColonnesV2_ImportRefuse_PartieNommee(string tampering)
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest();
        await V1Data.InsertAsync(cs, player);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(17, player.Id, ChallengeId) { CreatedAt = Started });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 17, AtPosition1));
        await ImportDatabase.ExecuteAsync(cs, tampering);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("hors des limites des colonnes v2, parties : 17", result.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task GelsDeSerieHorsLimites_ImportRefuse_JoueurNomme()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest() with { StreakFreezes = 40000 };
        await V1Data.InsertAsync(cs, player);

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains($"Gels de série hors limites, joueurs : {player.Id}", result.Output, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("UPDATE daily.challenges SET seed = seed + 1 WHERE id = 5;", "défis repris à l'identique")]
    [InlineData("UPDATE daily.challenges SET date = date + 1 WHERE id = 5;", "défis repris à l'identique")]
    [InlineData("UPDATE daily.challenges SET origin = 1 WHERE id = 5;", "défis repris à l'identique")]
    [InlineData("DELETE FROM daily.challenge_tracks WHERE challenge_id = 5 AND position = 3;", "Vérification « morceaux des défis »")]
    [InlineData("UPDATE daily.challenge_tracks SET position = 4 WHERE challenge_id = 5 AND position = 3;", "morceaux des défis repris à l'identique")]
    [InlineData("DELETE FROM daily.sessions WHERE id = 2;", "Vérification « parties »")]
    [InlineData("UPDATE daily.sessions SET total_score = total_score + 1 WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET status = 2 WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET ended_at = ended_at + interval '1 second' WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET started_at = started_at + interval '1 second' WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET total_listened_seconds = 9 WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET freezes_used = 2 WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET freeze_earned = NOT freeze_earned WHERE id = 1;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET current_position = 3 WHERE id = 2;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET current_listened_seconds = 9 WHERE id = 2;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET current_hint_level = 0 WHERE id = 2;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET current_position = NULL, current_listened_seconds = NULL, current_hint_level = 0 WHERE id = 2;", "parties reprises à l'identique")]
    [InlineData("UPDATE daily.sessions SET status = 3 WHERE id = 2;", "parties reprises à l'identique")]
    [InlineData("DELETE FROM daily.answers WHERE session_id = 1 AND position = 2;", "Vérification « réponses »")]
    [InlineData("UPDATE daily.answers SET score = score + 1 WHERE session_id = 1 AND position = 2;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET artist_answer = 'x' WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET title_correct = NOT title_correct WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET hint_level = 2 WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET was_extended = NOT was_extended WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET listened_seconds = 3 WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET answered_at = now() WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET position = 4 WHERE session_id = 1 AND position = 2; UPDATE daily.answers SET position = 2 WHERE session_id = 1 AND position = 3; UPDATE daily.answers SET position = 3 WHERE session_id = 1 AND position = 4;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET artist_correct = NOT artist_correct WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.answers SET title_answer = 'x' WHERE session_id = 1 AND position = 1;", "réponses reprises à l'identique")]
    [InlineData("UPDATE daily.streaks SET current_streak = current_streak + 1;", "séries reprises à l'identique")]
    [InlineData("UPDATE daily.streaks SET freezes = 0;", "séries reprises à l'identique")]
    [InlineData("UPDATE daily.streaks SET last_played_date = NULL;", "séries reprises à l'identique")]
    [InlineData("DELETE FROM daily.streaks;", "Vérification « séries »")]
    [InlineData("SELECT setval('daily.sessions_hilo', 1, false);", "séquence des identifiants de parties")]
    [InlineData("SELECT setval('daily.challenges_hilo', 1, false);", "séquence des identifiants de défis")]
    public async Task Verification_DetecteUnEcart_EtAnnuleTout(string tampering, string expectedCheck)
    {
        var cs = await database.CreateDatabaseAsync();
        var (finisher, waiting) = (V1Player.Guest(), V1Player.Guest() with { CurrentStreak = 2, LastPlayedDate = Day, StreakFreezes = 1 });
        await V1Data.InsertAsync(cs, finisher, waiting);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs,
            new V1Session(1, finisher.Id, ChallengeId) { Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 2000, TotalDurationSeconds = 4.5m, FreezesUsed = 1, FreezeEarned = true },
            new V1Session(2, waiting.Id, ChallengeId) { CreatedAt = Started, TotalScore = 850, TotalDurationSeconds = 1m, CurrentTrackId = AtPosition2, CurrentTrackMinListenedSeconds = 1.5m, CurrentTrackHintLevelUsed = 1 });
        await V1DailyData.InsertAnswersAsync(cs,
            new V1Answer(1, 1, AtPosition1) { Score = 850 },
            new V1Answer(2, 1, AtPosition2) { ListenedDurationSeconds = 1.5m, Score = 700, WasExtended = true, TitleCorrect = false },
            new V1Answer(3, 1, AtPosition3) { ListenedDurationSeconds = 2m, Score = 450 },
            new V1Answer(4, 2, AtPosition1) { Score = 850 });

        var error = await ImportDatabase.ImportWithTamperingAsync(cs, tampering);

        Assert.Contains(expectedCheck, error.MessageText, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "daily.challenges"));
    }

    [Fact]
    public async Task Verification_ScoreDUnePartieTerminee_DifferentDeSesReponses_ImportRefuse()
    {
        // Même cas que dans la v1 corrompue : le total de la partie ne vaut plus la somme de ses réponses.
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Guest();
        await V1Data.InsertAsync(cs, player);
        await SeedChallengeAsync(cs);
        await V1DailyData.InsertSessionsAsync(cs, new V1Session(1, player.Id, ChallengeId) { Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 999, TotalDurationSeconds = 1m });
        await V1DailyData.InsertAnswersAsync(cs, new V1Answer(1, 1, AtPosition1) { Score = 850 });

        var result = await database.RunImportAsync(cs);

        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("score d'une partie terminée = somme de ses réponses", result.Output, StringComparison.Ordinal);
        Assert.Equal(0L, await Count(cs, "daily.sessions"));
    }

    [Fact]
    public async Task FigerLesStatistiques_ApresImport_ChaqueJourTermineAUnePhoto_PasLaVeilleNiLeJour()
    {
        var cs = await database.CreateDatabaseAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (finisher, abandoner, gone, late) = (V1Player.Guest(), V1Player.Guest(), V1Player.Guest(), V1Player.Guest());
        await V1Data.InsertAsync(cs, finisher, abandoner, gone with { IsDeleted = true, DeletedAt = Finished }, late);
        // Trois défis : un jour terminé pour de bon (J-10), la veille et le jour même (qui peuvent encore recevoir des fins de partie).
        var days = new[] { today.AddDays(-10), today.AddDays(-1), today };
        for (var i = 0; i < days.Length; i++)
        {
            await V1Data.InsertTracksAsync(cs, new V1Track(i + 1, 201 + i) { LastUsedDate = days[i], UsageCount = 1 });
            await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(i + 1, days[i]));
            await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(100 + i, i + 1, i + 1, 1));
        }

        await V1DailyData.InsertSessionsAsync(cs,
            new V1Session(1, finisher.Id, 1) { Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 850, TotalDurationSeconds = 1m },
            new V1Session(2, abandoner.Id, 1) { Status = 2, CreatedAt = Started, AbandonedAt = Finished },
            new V1Session(3, gone.Id, 1) { Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 850, TotalDurationSeconds = 1m },
            // Jamais terminée sur un jour révolu : expirée dans la photo, jamais « en cours ».
            new V1Session(4, late.Id, 1) { CreatedAt = Started },
            new V1Session(5, finisher.Id, 2) { Status = 1, CreatedAt = Started, CompletedAt = Finished, TotalScore = 850, TotalDurationSeconds = 1m });
        await V1DailyData.InsertAnswersAsync(cs,
            new V1Answer(1, 1, 100), new V1Answer(2, 3, 100), new V1Answer(3, 5, 101));
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        Assert.Equal(0L, await Count(cs, "daily.challenge_day_stats"));

        var first = await FreezeDayStatsCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={cs}"], TestContext.Current.CancellationToken);

        Assert.Equal(0, first);
        // Le jour terminé a sa photo ; la veille et le jour même restent calculés en direct.
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats"));
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats WHERE challenge_id = 1 AND version = 1"));
        // Le joueur supprimé n'est pas compté : une partie terminée, une abandonnée, une expirée (jamais « en cours »).
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats WHERE challenge_id = 1 AND (payload->>'playerCount')::int = 1 AND (payload->>'abandonedCount')::int = 1 AND (payload->>'expiredCount')::int = 1 AND (payload->>'pendingCount')::int = 0"));

        // Rejouée, la commande ne refait rien : la photo garde sa date de calcul.
        var computedAt = await ImportDatabase.ScalarAsync<DateTime>(cs, "SELECT computed_at FROM daily.challenge_day_stats WHERE challenge_id = 1");
        Assert.Equal(0, await FreezeDayStatsCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={cs}"], TestContext.Current.CancellationToken));
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats"));
        Assert.Equal(computedAt, await ImportDatabase.ScalarAsync<DateTime>(cs, "SELECT computed_at FROM daily.challenge_day_stats WHERE challenge_id = 1"));
    }

    [Fact]
    public async Task FigerLesStatistiques_UnJourEnEchec_LesSuivantsFiges_CodeDeSortie1()
    {
        var cs = await database.CreateDatabaseAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var days = new[] { today.AddDays(-12), today.AddDays(-11) };
        for (var i = 0; i < days.Length; i++)
        {
            await V1Data.InsertTracksAsync(cs, new V1Track(i + 1, 201 + i) { LastUsedDate = days[i], UsageCount = 1 });
            await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(i + 1, days[i]));
            await V1DailyData.InsertChallengeTracksAsync(cs, new V1ChallengeTrack(100 + i, i + 1, i + 1, 1));
        }
        Assert.Equal(0, (await database.RunImportAsync(cs)).ExitCode);
        // La photo du plus ancien jour est refusée par la base : la commande passe au suivant, puis échoue à la fin.
        await ImportDatabase.ExecuteAsync(cs, "ALTER TABLE daily.challenge_day_stats ADD CONSTRAINT ck_test_refuse CHECK (challenge_id <> 1)");

        var exitCode = await FreezeDayStatsCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={cs}"], TestContext.Current.CancellationToken);

        Assert.Equal(1, exitCode);
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats"));
        Assert.Equal(1L, await Count(cs, "daily.challenge_day_stats WHERE challenge_id = 2"));
    }

    /// <summary>Un défi de trois morceaux (position 1, 2 et 3, voir les constantes), tirés ce jour-là pour la première fois.</summary>
    private static async Task SeedChallengeAsync(string cs)
    {
        await V1Data.InsertTracksAsync(cs,
            new V1Track(1, 101) { LastUsedDate = Day, UsageCount = 1 },
            new V1Track(2, 102) { LastUsedDate = Day, UsageCount = 1 },
            new V1Track(3, 103) { LastUsedDate = Day, UsageCount = 1 });
        await V1DailyData.InsertChallengesAsync(cs, new V1Challenge(ChallengeId, Day));
        await V1DailyData.InsertChallengeTracksAsync(cs,
            new V1ChallengeTrack(AtPosition1, ChallengeId, 1, 1),
            new V1ChallengeTrack(AtPosition2, ChallengeId, 2, 2),
            new V1ChallengeTrack(AtPosition3, ChallengeId, 3, 3));
    }

    private static Task<long> Count(string cs, string fromWhere) =>
        ImportDatabase.ScalarAsync<long>(cs, $"SELECT count(*) FROM {fromWhere}");
}

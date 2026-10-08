using Npgsql;

namespace InSeconds.MigrationTests;

/// <summary>Un défi v1, tel que la table <c>public."DailyChallenges"</c> le contient.</summary>
public sealed record V1Challenge(int Id, DateOnly Date)
{
    public int Seed { get; init; } = 7;
}

/// <summary>Un morceau d'un défi v1 (<c>public."DailyChallengeTracks"</c>) : son identifiant propre, et sa position dans le défi.</summary>
public sealed record V1ChallengeTrack(int Id, int ChallengeId, int TrackId, int Position)
{
    /// <summary>Colonne abandonnée en v2 : la v1 y écrivait la position.</summary>
    public int DeezerRankSnapshot { get; init; } = Position;
}

/// <summary>Une partie v1 (<c>public."GameSessions"</c>). <c>CurrentTrackId</c> est l'identifiant v1 d'un morceau du défi, pas une position.</summary>
public sealed record V1Session(int Id, Guid PlayerId, int ChallengeId)
{
    public int Status { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = new(2026, 9, 20, 9, 0, 0, TimeSpan.Zero);
    public DateTimeOffset? CompletedAt { get; init; }
    public DateTimeOffset? AbandonedAt { get; init; }
    public int TotalScore { get; init; }
    public decimal TotalDurationSeconds { get; init; }
    public int? CurrentTrackId { get; init; }
    public decimal? CurrentTrackMinListenedSeconds { get; init; }
    public int CurrentTrackHintLevelUsed { get; init; }
    public int FreezesUsed { get; init; }
    public bool FreezeEarned { get; init; }
}

/// <summary>Une réponse v1 (<c>public."GameSessionAnswers"</c>), rattachée au morceau du défi par son identifiant v1.</summary>
public sealed record V1Answer(int Id, int SessionId, int ChallengeTrackId)
{
    public decimal ListenedDurationSeconds { get; init; } = 1m;
    public bool WasExtended { get; init; }
    public int HintLevelUsed { get; init; }
    public string? ArtistAnswer { get; init; } = "Daft Punk";
    public string? TitleAnswer { get; init; } = "One More Time";
    public bool ArtistCorrect { get; init; } = true;
    public bool TitleCorrect { get; init; } = true;
    public int Score { get; init; } = 850;
}

/// <summary>Écrit les défis, parties et réponses de forme v1 (voir <see cref="V1Data"/> pour les joueurs et les morceaux).</summary>
public static class V1DailyData
{
    public static Task InsertChallengesAsync(string connectionString, params V1Challenge[] challenges) =>
        ExecuteEachAsync(connectionString, challenges, (c, command) =>
        {
            command.CommandText = """
                INSERT INTO public."DailyChallenges" ("Id", "Date", "Seed") OVERRIDING SYSTEM VALUE VALUES (@id, @date, @seed)
                """;
            command.Parameters.AddWithValue("id", c.Id);
            command.Parameters.AddWithValue("date", c.Date);
            command.Parameters.AddWithValue("seed", c.Seed);
        });

    public static Task InsertChallengeTracksAsync(string connectionString, params V1ChallengeTrack[] tracks) =>
        ExecuteEachAsync(connectionString, tracks, (t, command) =>
        {
            command.CommandText = """
                INSERT INTO public."DailyChallengeTracks" ("Id", "DailyChallengeId", "TrackId", "DeezerRankSnapshot", "Position")
                OVERRIDING SYSTEM VALUE VALUES (@id, @challenge, @track, @rank, @position)
                """;
            command.Parameters.AddWithValue("id", t.Id);
            command.Parameters.AddWithValue("challenge", t.ChallengeId);
            command.Parameters.AddWithValue("track", t.TrackId);
            command.Parameters.AddWithValue("rank", t.DeezerRankSnapshot);
            command.Parameters.AddWithValue("position", t.Position);
        });

    public static Task InsertSessionsAsync(string connectionString, params V1Session[] sessions) =>
        ExecuteEachAsync(connectionString, sessions, (s, command) =>
        {
            command.CommandText = """
                INSERT INTO public."GameSessions" ("Id", "PlayerId", "DailyChallengeId", "Status", "CreatedAt", "CompletedAt", "AbandonedAt",
                    "TotalScore", "TotalDurationSeconds", "CurrentTrackId", "CurrentTrackMinListenedSeconds", "CurrentTrackHintLevelUsed",
                    "FreezesUsed", "FreezeEarned")
                OVERRIDING SYSTEM VALUE
                VALUES (@id, @player, @challenge, @status, @createdAt, @completedAt, @abandonedAt, @score, @duration, @currentTrack, @minListened,
                    @hint, @freezesUsed, @freezeEarned)
                """;
            command.Parameters.AddWithValue("id", s.Id);
            command.Parameters.AddWithValue("player", s.PlayerId);
            command.Parameters.AddWithValue("challenge", s.ChallengeId);
            command.Parameters.AddWithValue("status", s.Status);
            command.Parameters.AddWithValue("createdAt", s.CreatedAt);
            command.Parameters.AddWithValue("completedAt", (object?)s.CompletedAt ?? DBNull.Value);
            command.Parameters.AddWithValue("abandonedAt", (object?)s.AbandonedAt ?? DBNull.Value);
            command.Parameters.AddWithValue("score", s.TotalScore);
            command.Parameters.AddWithValue("duration", s.TotalDurationSeconds);
            command.Parameters.AddWithValue("currentTrack", (object?)s.CurrentTrackId ?? DBNull.Value);
            command.Parameters.AddWithValue("minListened", (object?)s.CurrentTrackMinListenedSeconds ?? DBNull.Value);
            command.Parameters.AddWithValue("hint", s.CurrentTrackHintLevelUsed);
            command.Parameters.AddWithValue("freezesUsed", s.FreezesUsed);
            command.Parameters.AddWithValue("freezeEarned", s.FreezeEarned);
        });

    public static Task InsertAnswersAsync(string connectionString, params V1Answer[] answers) =>
        ExecuteEachAsync(connectionString, answers, (a, command) =>
        {
            command.CommandText = """
                INSERT INTO public."GameSessionAnswers" ("Id", "GameSessionId", "DailyChallengeTrackId", "ListenedDurationSeconds", "WasExtended",
                    "HintLevelUsed", "ArtistAnswer", "TitleAnswer", "ArtistCorrect", "TitleCorrect", "Score")
                OVERRIDING SYSTEM VALUE
                VALUES (@id, @session, @track, @listened, @extended, @hint, @artist, @title, @artistCorrect, @titleCorrect, @score)
                """;
            command.Parameters.AddWithValue("id", a.Id);
            command.Parameters.AddWithValue("session", a.SessionId);
            command.Parameters.AddWithValue("track", a.ChallengeTrackId);
            command.Parameters.AddWithValue("listened", a.ListenedDurationSeconds);
            command.Parameters.AddWithValue("extended", a.WasExtended);
            command.Parameters.AddWithValue("hint", a.HintLevelUsed);
            command.Parameters.AddWithValue("artist", (object?)a.ArtistAnswer ?? DBNull.Value);
            command.Parameters.AddWithValue("title", (object?)a.TitleAnswer ?? DBNull.Value);
            command.Parameters.AddWithValue("artistCorrect", a.ArtistCorrect);
            command.Parameters.AddWithValue("titleCorrect", a.TitleCorrect);
            command.Parameters.AddWithValue("score", a.Score);
        });

    private static async Task ExecuteEachAsync<T>(string connectionString, IEnumerable<T> rows, Action<T, NpgsqlCommand> prepare)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        foreach (var row in rows)
        {
            await using var command = new NpgsqlCommand { Connection = connection };
            prepare(row, command);
            await command.ExecuteNonQueryAsync();
        }
    }
}

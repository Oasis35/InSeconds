using System.Globalization;
using Npgsql;

namespace InSeconds.MigrationTests;

/// <summary>Un joueur v1, tel que la table <c>public."Players"</c> le contient.</summary>
public sealed record V1Player(Guid Id, Guid AuthToken)
{
    public bool IsGuest { get; init; } = true;
    public string? Email { get; init; }
    public string? Pseudo { get; init; }
    public bool IsAdmin { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = new(2026, 7, 1, 10, 0, 0, TimeSpan.Zero);
    public DateTimeOffset? LastSeenAt { get; init; }
    public bool IsDeleted { get; init; }
    public DateTimeOffset? DeletedAt { get; init; }
    public int CurrentStreak { get; init; }
    public DateOnly? LastPlayedDate { get; init; }
    public int StreakFreezes { get; init; }

    public static V1Player Guest() => new(Guid.NewGuid(), Guid.NewGuid());

    public static V1Player Account(string email, string pseudo) =>
        Guest() with { IsGuest = false, Email = email, Pseudo = pseudo };
}

/// <summary>Un morceau v1, tel que la table <c>public."Tracks"</c> le contient.</summary>
public sealed record V1Track(int Id, long DeezerTrackId)
{
    public string Artist { get; init; } = "Artiste";
    public string Title { get; init; } = "Titre";
    public string? CoverHash { get; init; } = "abc123";
    public int? ReleaseYear { get; init; } = 2001;
    public bool HasPreview { get; init; } = true;
    public bool IsDisabled { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = new(2026, 6, 1, 8, 0, 0, TimeSpan.Zero);
    public DateTimeOffset? UpdatedAt { get; init; }
    public DateOnly? LastUsedDate { get; init; }
    public int UsageCount { get; init; }
}

/// <summary>Écrit des données de forme v1, comme la v1 les aurait enregistrées.</summary>
public static class V1Data
{
    public static async Task InsertTracksAsync(string connectionString, params V1Track[] tracks)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        foreach (var t in tracks)
        {
            await using var command = new NpgsqlCommand("""
                INSERT INTO public."Tracks" ("Id", "DeezerTrackId", "Artist", "Title", "CoverHash", "ReleaseYear",
                    "HasPreview", "IsDisabled", "CreatedAt", "UpdatedAt", "LastUsedDate", "UsageCount")
                OVERRIDING SYSTEM VALUE
                VALUES (@id, @deezerId, @artist, @title, @cover, @year, @hasPreview, @isDisabled, @createdAt,
                    @updatedAt, @lastUsed, @usage)
                """, connection);
            command.Parameters.AddWithValue("id", t.Id);
            command.Parameters.AddWithValue("deezerId", t.DeezerTrackId);
            command.Parameters.AddWithValue("artist", t.Artist);
            command.Parameters.AddWithValue("title", t.Title);
            command.Parameters.AddWithValue("cover", (object?)t.CoverHash ?? DBNull.Value);
            command.Parameters.AddWithValue("year", (object?)t.ReleaseYear ?? DBNull.Value);
            command.Parameters.AddWithValue("hasPreview", t.HasPreview);
            command.Parameters.AddWithValue("isDisabled", t.IsDisabled);
            command.Parameters.AddWithValue("createdAt", t.CreatedAt);
            command.Parameters.AddWithValue("updatedAt", (object?)t.UpdatedAt ?? DBNull.Value);
            command.Parameters.AddWithValue("lastUsed", (object?)t.LastUsedDate ?? DBNull.Value);
            command.Parameters.AddWithValue("usage", t.UsageCount);
            await command.ExecuteNonQueryAsync();
        }
    }

    public static async Task InsertAsync(string connectionString, params V1Player[] players)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        foreach (var p in players)
        {
            await using var command = new NpgsqlCommand("""
                INSERT INTO public."Players" ("Id", "AuthToken", "IsGuest", "Email", "Pseudo", "IsAdmin", "CreatedAt",
                    "LastSeenAt", "IsDeleted", "DeletedAt", "CurrentStreak", "LastPlayedDate", "StreakFreezes")
                VALUES (@id, @authToken, @isGuest, @email, @pseudo, @isAdmin, @createdAt,
                    @lastSeenAt, @isDeleted, @deletedAt, @streak, @lastPlayed, @freezes)
                """, connection);
            command.Parameters.AddWithValue("id", p.Id);
            command.Parameters.AddWithValue("authToken", p.AuthToken);
            command.Parameters.AddWithValue("isGuest", p.IsGuest);
            command.Parameters.AddWithValue("email", (object?)p.Email ?? DBNull.Value);
            command.Parameters.AddWithValue("pseudo", (object?)p.Pseudo ?? DBNull.Value);
            command.Parameters.AddWithValue("isAdmin", p.IsAdmin);
            command.Parameters.AddWithValue("createdAt", p.CreatedAt);
            command.Parameters.AddWithValue("lastSeenAt", (object?)p.LastSeenAt ?? DBNull.Value);
            command.Parameters.AddWithValue("isDeleted", p.IsDeleted);
            command.Parameters.AddWithValue("deletedAt", (object?)p.DeletedAt ?? DBNull.Value);
            command.Parameters.AddWithValue("streak", p.CurrentStreak);
            command.Parameters.AddWithValue("lastPlayed", (object?)p.LastPlayedDate ?? DBNull.Value);
            command.Parameters.AddWithValue("freezes", p.StreakFreezes);
            await command.ExecuteNonQueryAsync();
        }
    }

    /// <summary>Jeton de magic link v1 ; son hash est en hexadécimal majuscule (<c>Convert.ToHexString</c>).</summary>
    public static Task InsertMagicLinkTokenAsync(string connectionString, string email, byte[] hash, string expiresIn, bool consumed = false) =>
        ImportDatabase.ExecuteAsync(connectionString, $"""
            INSERT INTO public."MagicLinkTokens" ("Email", "TokenHash", "CreatedAt", "ExpiresAt", "ConsumedAt")
            VALUES ('{email}', '{Convert.ToHexString(hash)}', now() - interval '1 minute', now() + interval '{expiresIn}',
                    {(consumed ? "now()" : "NULL")})
            """);

    public static Task InsertEmailChangeTokenAsync(string connectionString, Guid playerId, string newEmail, byte[] hash) =>
        ImportDatabase.ExecuteAsync(connectionString, $"""
            INSERT INTO public."EmailChangeTokens" ("PlayerId", "NewEmail", "TokenHash", "CreatedAt", "ExpiresAt")
            VALUES ('{playerId}', '{newEmail}', '{Convert.ToHexString(hash)}', now() - interval '1 minute', now() + interval '10 minutes')
            """);

    public static string Sql(DateTimeOffset value) =>
        $"'{value.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss.ffffff", CultureInfo.InvariantCulture)}+00'";
}

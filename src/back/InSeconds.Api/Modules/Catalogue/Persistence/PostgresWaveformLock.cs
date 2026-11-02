using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Application;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

/// <summary>Le verrou consultatif PostgreSQL de <see cref="IWaveformLock"/>.</summary>
public sealed class PostgresWaveformLock(InSecondsDbContext db) : IWaveformLock
{
    /// <summary>La clé du verrou (le numéro du ticket, 474) : propre à ce calcul, aucun autre verrou consultatif dans l'API.</summary>
    private const long Key = 474;

    public async Task<IAsyncDisposable?> TryAcquireAsync(CancellationToken ct)
    {
        var connection = new NpgsqlConnection(db.Database.GetConnectionString());
        try
        {
            await connection.OpenAsync(ct);
            await using var command = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection);
            command.Parameters.AddWithValue("key", Key);
            if ((bool)(await command.ExecuteScalarAsync(ct))!)
                return new Held(connection);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }

        await connection.DisposeAsync();
        return null;
    }

    private sealed class Held(NpgsqlConnection connection) : IAsyncDisposable
    {
        // Fermer la connexion libère le verrou de session ; le pool la réinitialise (DISCARD ALL) avant de la rendre.
        public ValueTask DisposeAsync() => connection.DisposeAsync();
    }
}

using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Api.Testing.Deezer;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Testing.E2E;

/// <summary>
/// Le pool de test (repris de la v1) : 40 morceaux jouables et 5 sans extrait (identifiants Deezer ≥
/// <see cref="FakeDeezerHandler.NoPreviewFrom"/>, que le faux Deezer déclare sans preview). Les identifiants
/// Deezer commencent à 1000 : ils ne croisent pas ceux de la recherche du faux (1 à 4).
/// </summary>
public static class CatalogueSeed
{
    public const int PlayableCount = 40;
    public const int WithoutPreviewCount = 5;
    public const long FirstDeezerId = 1000;

    /// <summary>Ajoute le pool s'il est vide. Renvoie le nombre de morceaux ajoutés.</summary>
    public static async Task<int> SeedAsync(InSecondsDbContext db, TimeProvider time, CancellationToken ct)
    {
        if (await db.Set<Track>().AnyAsync(ct))
            return 0;

        var now = time.GetUtcNow();
        for (var i = 0; i < PlayableCount + WithoutPreviewCount; i++)
        {
            var withPreview = i < PlayableCount;
            var deezerId = withPreview ? FirstDeezerId + i : FakeDeezerHandler.NoPreviewFrom + i;
            await db.AddAsync(Track.Create(
                new TrackMetadata(deezerId, $"Artiste {i + 1:00}", $"Titre {i + 1:00}", CoverHash: null, ReleaseYear: (short)(1990 + i % 30), Rank: 500_000 + i,
                    withPreview ? PreviewStatus.Available : PreviewStatus.Missing), now), ct);
        }

        await db.SaveChangesAsync(ct);
        return PlayableCount + WithoutPreviewCount;
    }
}

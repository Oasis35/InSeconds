using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Testing.Deezer;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Testing.E2E;

/// <summary>
/// Le pool de test, repris de la v1 (<c>E2ESeedData</c>) : 55 morceaux réels, dans l'ordre exact de la v1 (les
/// index comptent). 0-4 : défi d'avant-hier, 5-9 : défi d'hier, 10-14 : défi du jour, 15-20 : cooldowns variés,
/// le reste : le pool disponible. Les 5 derniers (identifiants Deezer ≥ <see cref="FakeDeezerHandler.NoPreviewFrom"/>)
/// n'ont pas d'extrait. L'usage de ces morceaux est celui de la v1, reconstitué par de vrais défis (Daily, E1) :
/// le défi d'avant-hier, celui d'hier, celui du jour, et des défis plus anciens pour les cooldowns.
/// </summary>
public static class CatalogueSeed
{
    public const int PlayableCount = 50;
    public const int WithoutPreviewCount = 5;

    public sealed record SeedTrack(long DeezerTrackId, string Artist, string Title, string? CoverHash);

    public static readonly IReadOnlyList<SeedTrack> Tracks =
    [
        new(66609426, "Daft Punk", "Get Lucky", "bc49adb87758e0c8c4e508a9c5cce85d"),
        new(6297555, "Stromae", "Alors on danse", "43bd78a4753df33da9efc2207c4286ee"),
        new(3128096, "Coldplay", "Yellow", "970dce98eeea6729244c0ae71707a83d"),
        new(92734438, "Mark Ronson", "Uptown Funk", "3734366a73152d0367a83a4b09fd163f"),
        new(2553265, "Beyoncé", "Halo", "7cf0bdc409e7a7898c745bf0244df312"),
        new(701326562, "Pharrell Williams", "Happy", "a1939a9a40dc97ed404cc4597c6a32bc"),
        new(2176852, "Amy Winehouse", "Rehab", "5772b495f0dcdf660d0fc88c4c38a3fa"),
        new(3129407, "Gorillaz", "Feel Good Inc.", "3dc29a565149240729afc08e1f251b46"),
        new(925106, "Rihanna", "Umbrella", "91276466fbc876d96be9e6926060af60"),
        new(969494, "Justin Timberlake", "Cry Me a River", "7cba368fa8466d72d149264577cb19d7"),
        new(1109731, "Eminem", "Lose Yourself", "e2b36a9fda865cb2e9ed1476b6291a7d"),
        new(138547415, "Radiohead", "Creep", "1dd56fd8824492e1a5106c99a00a85ec"),
        new(655095912, "Billie Eilish", "bad guy", "6630083f454d48eadb6a9b53f035d734"),
        new(1178682, "Kanye West", "Stronger", "15012d974c6263aec95e52e6d86cba23"),
        new(676960, "JAY Z", "99 Problems", "7245b8fe756d39f20a53020163168dbe"),
        new(4603408, "Michael Jackson", "Billie Jean", "a0ad67d1beb761f2cb9f8b60e5bcf07a"),
        new(5055001, "Queen", "Bohemian Rhapsody", "6bfb24a6d8f37ba563284d311586f2be"),
        new(13791930, "Nirvana", "Smells Like Teen Spirit", "f0282817b697279e56df13909962a54a"),
        new(908604612, "The Weeknd", "Blinding Lights", "fd00ebd6d30d7253f813dba3bb1c66a9"),
        new(8086126, "Adele", "Rolling in the Deep", "dc1ce848d830ecc93521be5a78350364"),
        new(139470659, "Ed Sheeran", "Shape of You", "107c2b43f10c249077c1f7618563bb63"),
        new(350171311, "Kendrick Lamar", "HUMBLE.", "7ce6b8452fae425557067db6e6a1cad5"),
        new(533609232, "Drake", "God's Plan", "b69d3bcbd130ad4cc9259de543889e30"),
        new(2783963122, "Kendrick Lamar", "Not Like Us", "84345d29bc2ed8e713112425f8417e97"),
        new(435821782, "Childish Gambino", "Redbone", "964acadabc2b6e286ce5e8e5add495a0"),
        new(653159322, "PNL", "Au DD", "ff5caf314549e1cff1960c5b2acfd384"),
        new(414838122, "Orelsan", "Basique", "90f68d5df45b5f24710a70deb571d350"),
        new(546875572, "Angèle", "Balance ton quoi", "4a2360324af313f73b56fd1f7faaac88"),
        new(870857, "Suprême NTM", "Ma Benz", "529623a3281a7709098859887ddfa467"),
        new(369711461, "Booba", "Ouest Side", "7fa62027aafd910591ac2ab292fbfbf3"),
        new(70322132, "Arctic Monkeys", "R U Mine?", "64e54e307bd5e2bdb27ffeb662fd910d"),
        new(3590186, "Muse", "Supermassive Black Hole", "fc457d27a8c0b7fc6f9b56fb94e22a0d"),
        new(461043312, "David Bowie", "\"Heroes\"", "5fb91018679f65199308256be3c584ab"),
        new(2525864, "The Police", "Every Breath You Take", "316afdaed93c4a18cf730389648d03d6"),
        new(985745702, "Oasis", "Wonderwall", "ddb062c517401ee74d8a4df6f895d75e"),
        new(138539157, "Radiohead", "No Surprises", "7a378976d3ff1b1fd7b21ee0c7f95fa5"),
        new(3102130, "Blur", "Song 2", "1e6f6130ca0ccbdd0cde4dc2b05e6df9"),
        new(958109, "The Strokes", "Last Nite", "700f0375d5ac8570f16a2c7eb128303f"),
        new(13791932, "Nirvana", "Come As You Are", "f0282817b697279e56df13909962a54a"),
        new(676183, "Linkin Park", "In the End", "033a271b5ec10842c287827c39244fb5"),
        new(103052662, "Tame Impala", "The Less I Know The Better", "de5b9b704cd4ec36f8bf49beb3e17ba2"),
        new(10284909, "Justice", "D.A.N.C.E.", "d779ba5bc3bb32475a78909d97cf8964"),
        new(3129748, "Massive Attack", "Teardrop", "85abbdc3ed4a7b94ace97f868fe70f63"),
        new(3130293, "The Chemical Brothers", "Galvanize", "51d7e6bb289a89b531aaa7d047baa6ea"),
        new(62126191, "The Prodigy", "Firestarter", "566d28d32080a6d82a2d4d145ea5ea7e"),
        new(1124841682, "Dua Lipa", "Levitating", "f8364f090ba04f1b19b381ec0390f3e4"),
        new(742744952, "Post Malone", "Circles", "6fb46005a49df7aeba49f1ca117f3710"),
        new(797228462, "Doja Cat", "Say So", "1e0d4359a328f8b0ea3563e8623a09aa"),
        new(18190280, "Lana Del Rey", "Summertime Sadness", "4c2c6143c3e83a01ea73517c57d1d138"),
        new(2743578151, "Sabrina Carpenter", "Espresso", "e3221287a77eb262944e6528766eeba4"),
        new(9000000001, "The Beatles", "Come Together", null),
        new(9000000002, "Pink Floyd", "Comfortably Numb", null),
        new(9000000003, "Bob Dylan", "Like a Rolling Stone", null),
        new(9000000004, "Led Zeppelin", "Stairway to Heaven", null),
        new(9000000005, "Fleetwood Mac", "Go Your Own Way", null),
    ];

    /// <summary>Ajoute le pool s'il est vide. Renvoie le nombre de morceaux ajoutés.</summary>
    public static async Task<int> SeedAsync(InSecondsDbContext db, TimeProvider time, CancellationToken ct)
    {
        if (await db.Set<Track>().AnyAsync(ct))
            return 0;

        var now = time.GetUtcNow();
        var tracks = new List<Track>(Tracks.Count);
        for (var i = 0; i < Tracks.Count; i++)
        {
            var t = Tracks[i];
            var preview = t.DeezerTrackId < FakeDeezerHandler.NoPreviewFrom ? PreviewStatus.Available : PreviewStatus.Missing;
            tracks.Add(Track.Create(
                new TrackMetadata(t.DeezerTrackId, t.Artist, t.Title, t.CoverHash, ReleaseYear: (short)(1990 + i % 30), Rank: 500_000 + i, preview), now));
        }

        await db.AddRangeAsync(tracks, ct);
        await db.SaveChangesAsync(ct);

        // Les identifiants viennent de la séquence : connus seulement après l'enregistrement. Un défi par jour où un morceau a
        // servi ; les morceaux utilisés plusieurs fois (17, 18, 19) ont des défis plus anciens, une semaine d'écart.
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var byDay = new SortedDictionary<DateOnly, List<int>>();
        for (var i = 0; i < tracks.Count; i++)
        {
            if (Usage(i) is not { } used)
                continue;
            for (var use = 0; use < used.Count; use++)
            {
                var day = today.AddDays(-(used.DaysAgo + use * 7));
                if (!byDay.TryGetValue(day, out var ids))
                    byDay[day] = ids = [];
                ids.Add(tracks[i].Id);
            }
        }

        await db.AddRangeAsync(byDay.Select(d => DailyChallenge.Create(d.Key, ChallengeOrigin.Nightly, d.Value)), ct);
        await db.SaveChangesAsync(ct);

        return tracks.Count;
    }

    // (jours depuis le dernier usage, nombre d'usages), comme la v1 ; null : jamais utilisé.
    private static (int DaysAgo, int Count)? Usage(int index) => index switch
    {
        <= 4 => (2, 1),
        <= 9 => (1, 1),
        <= 14 => (0, 1),
        16 => (5, 1),
        17 => (30, 3),
        18 => (31, 2),
        19 => (90, 7),
        20 => (15, 1),
        _ => null,
    };
}

using InSeconds.Api.Modules.Catalogue.Application;

namespace InSeconds.IntegrationTests;

/// <summary>Lecture d'une ligne du pool dans les tests : ce que le Daily en dit (le pool le donne mode par mode), ou rien s'il n'a rien à dire.</summary>
internal static class TrackListItemReading
{
    public static TrackModeUsage Daily(this TrackListItem track) => track.UsageOf("daily");

    public static TrackModeUsage UsageOf(this TrackListItem track, string mode) =>
        track.Usages.SingleOrDefault(u => u.Mode == mode) ?? new TrackModeUsage(mode, 0, null, null, false);
}

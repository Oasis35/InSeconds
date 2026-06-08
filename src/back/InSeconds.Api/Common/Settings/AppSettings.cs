namespace InSeconds.Api.Common.Settings;

public sealed class AppSettings
{
    public int[]               AllowedDurationsSeconds { get; set; } = [1, 2, 3, 5, 10, 15, 30];
    public int                 GuessTimerSeconds       { get; set; } = 20;
    public int                 MaxExtensionsPerAnswer  { get; set; } = 1;
    public int                 TracksPerChallenge      { get; set; } = 3;
    public Dictionary<int,int> DurationScores          { get; set; } = new() { [1]=1000, [2]=850, [3]=700, [5]=500, [10]=300, [15]=150, [30]=50 };
    public string              CoverUrlTemplate        { get; set; } = "https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg";

    public string BuildCoverUrl(string? hash) =>
        hash is null ? string.Empty : CoverUrlTemplate.Replace("{hash}", hash);
}

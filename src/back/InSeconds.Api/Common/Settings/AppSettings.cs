namespace InSeconds.Api.Common.Settings;

public sealed class AppSettings
{
    public decimal[]               AllowedDurationsSeconds { get; set; } = [0.50m, 1m, 1.5m, 2m, 3m, 5m, 10m];
    public int                     GuessTimerSeconds       { get; set; } = 20;
    public int                     TracksPerChallenge      { get; set; } = 3;
    public Dictionary<decimal,int> DurationScores          { get; set; } = new() { [0.50m]=1000, [1m]=850, [1.5m]=700, [2m]=550, [3m]=400, [5m]=250, [10m]=100 };
    public string              CoverUrlTemplate        { get; set; } = "https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg";

    public string BuildCoverUrl(string? hash) =>
        hash is null ? string.Empty : CoverUrlTemplate.Replace("{hash}", hash);
}

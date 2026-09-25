namespace InSeconds.Api.Common.Stats;

/// <summary>Nombre de joueurs dont le score total tombe dans [<c>MinScore</c>, <c>MaxScore</c>].</summary>
public sealed record ScoreBucketDto(int MinScore, int MaxScore, int Count);

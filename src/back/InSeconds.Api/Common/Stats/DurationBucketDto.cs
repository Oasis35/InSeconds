namespace InSeconds.Api.Common.Stats;

/// <summary>Nombre de joueurs ayant trouvé (artiste ou titre) pour un palier d'écoute donné.</summary>
public sealed record DurationBucketDto(decimal DurationSeconds, int Count);

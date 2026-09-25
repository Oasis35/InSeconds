namespace InSeconds.Api.Features.Sessions.StartSession;

public sealed record StartSessionResponse(
    int SessionId,
    IReadOnlyList<TrackSlot> Tracks,
    int CurrentStreak,
    bool IsResuming,
    int ResumeFromPosition,
    IReadOnlyList<ResumedAnswer> CompletedAnswers,
    // Anti-cheat : durée min déjà écoutée sur le morceau en cours (null si pas de reprise ou track non commencée)
    int? CurrentTrackId = null,
    decimal? MinListenedSeconds = null);

// Pas d'identifiant Deezer ici : envoyé avant de jouer, il donnerait la réponse
// (deezer.com/track/{id}). Il n'arrive qu'avec la réponse (SubmitAnswer, ResumedAnswer).
public sealed record TrackSlot(
    int Id,
    int Position,
    string PreviewUrl,
    string? CoverUrl);

public sealed record ResumedAnswer(
    int Position,
    bool ArtistCorrect,
    bool TitleCorrect,
    int Score,
    decimal ListenedDurationSeconds,
    string CorrectArtist = "",
    string CorrectTitle = "",
    long DeezerTrackId = 0);

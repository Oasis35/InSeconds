namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed record SubmitAnswerResponse(
    bool ArtistCorrect,
    bool TitleCorrect,
    int Score,
    string CorrectArtist,
    string CorrectTitle);

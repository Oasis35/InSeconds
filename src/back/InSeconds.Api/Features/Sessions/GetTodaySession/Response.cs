namespace InSeconds.Api.Features.Sessions.GetTodaySession;

/// <summary>
/// État du défi du jour pour le navigateur courant, sans créer ni Player ni session
/// (contrairement à <c>POST /api/sessions</c>). Alimente l'écran d'accueil : le front
/// n'appelle <c>POST /api/sessions</c> qu'au clic « Commencer à jouer » / « Reprendre ».
/// </summary>
/// <param name="State">
/// <c>no_challenge</c> · <c>can_start</c> · <c>resumable</c> · <c>already_played</c> · <c>abandoned</c>.
/// Sérialisé en <see cref="string"/> (cohérent avec <c>ChallengePlayerDto.Status</c>, sans ambiguïté int/string côté NSwag).
/// </param>
/// <param name="TracksCount">Nombre de morceaux du défi (0 si <c>no_challenge</c>).</param>
/// <param name="CompletedCount">Nombre de morceaux déjà répondus — non nul uniquement si <c>resumable</c>.</param>
/// <param name="CurrentStreak">Streak du joueur courant (0 si aucun cookie / joueur jamais créé) — pour le badge de l'écran d'accueil.</param>
public sealed record GetTodaySessionResponse(string State, int TracksCount, int CompletedCount, int CurrentStreak);

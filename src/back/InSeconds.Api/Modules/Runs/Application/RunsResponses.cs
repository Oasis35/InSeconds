namespace InSeconds.Api.Modules.Runs.Application;

// Ce que portent les réponses des routes de la partie, dicté par les écrans (docs/runs/conception.md § 3.5). **Rien qui identifie un morceau avant
// sa réponse** (piège 31) : ni nom, ni pochette, ni identifiant Deezer d'un morceau à venir, et l'adresse d'extrait du morceau en cours seulement.

/// <summary>
/// Le résultat d'un morceau joué : pastille de la manche, carré de l'écran de fin, ligne du bilan de manche, carte de réponse. Un morceau neutralisé
/// ne dit rien de lui (ni artiste, ni titre, ni pochette).
/// </summary>
/// <param name="Position">Sa position dans la playlist (de 1 à N).</param>
/// <param name="Round">Sa manche, à partir de 1.</param>
/// <param name="Neutralized">Deezer n'avait plus d'extrait : le morceau ne compte pas.</param>
/// <param name="Points">Ses points, au multiplicateur de sa manche.</param>
/// <param name="Waveform">
/// La forme de son extrait en base64, pour la ligne grisée de la pile ; seulement dans <see cref="RunSessionResponse.PlayedTracks"/> d'un démarrage
/// ou d'une reprise (après une réponse, le navigateur a déjà la forme du morceau qu'il vient de jouer), et vide si elle n'est pas calculée.
/// </param>
public sealed record RunTrackResponse(
    int Position, int Round, bool Neutralized, bool ArtistCorrect, bool TitleCorrect, int Points,
    string? Artist, string? Title, string? CoverUrl, long? DeezerTrackId, string? Waveform = null);

/// <summary>La manche en cours : la jauge.</summary>
/// <param name="Score">Les points de la manche.</param>
/// <param name="Objective">Les points à atteindre pour la passer (recalculé sans les morceaux neutralisés).</param>
/// <param name="MaxScore">Ce que rapportent au plus ses morceaux non neutralisés, à la difficulté de la manche (son plafond).</param>
/// <param name="Difficulty">Sa difficulté : <c>easy</c>, <c>safe</c> ou <c>risky</c> (« Sûre » tant qu'elle n'est pas choisie).</param>
public sealed record RunRoundResponse(int Round, int Score, int Objective, int MaxScore, string Difficulty);

/// <summary>Une difficulté proposée pour la manche à venir (une colonne de l'écran « Difficulté ? »).</summary>
/// <param name="Difficulty"><c>easy</c>, <c>safe</c> ou <c>risky</c>.</param>
/// <param name="Objective">Les points à atteindre pour passer la manche à cette difficulté (le cadenas).</param>
/// <param name="MaxScore">Ce que la manche rapporte au plus à cette difficulté (la hauteur de la colonne).</param>
/// <param name="ListenSeconds">L'écoute d'un morceau de la manche à cette difficulté (plus courte pour la manche boss).</param>
public sealed record RunDifficultyOptionResponse(string Difficulty, int Objective, int MaxScore, decimal ListenSeconds);

/// <summary>Le choix de difficulté qui attend le joueur : la manche en cours n'a pas encore commencé et propose plusieurs difficultés.</summary>
/// <param name="Options">Les difficultés proposées, de la plus facile à la plus risquée.</param>
public sealed record RunDifficultyChoiceResponse(int Round, IReadOnlyList<RunDifficultyOptionResponse> Options);

/// <summary>Le morceau à jouer maintenant.</summary>
/// <param name="PositionInRound">Sa place dans la manche (« Morceau 3 sur 5 »).</param>
/// <param name="PreviewUrl">
/// L'extrait signé et périssable (piège 14) ; vide si Deezer n'a pas répondu (panne, quota) : le joueur réessaie par <c>POST …/preview</c>, le
/// morceau reste en cours.
/// </param>
/// <param name="ListenSeconds">
/// Son écoute fixe, à la difficulté de sa manche (la manche boss est plus courte) : c'est elle qui fait foi.
/// </param>
/// <param name="Waveform">La forme de l'extrait en base64 (cf. <c>TrackSlot</c> du Daily), vide si elle n'est pas calculée : le navigateur calcule la sienne.</param>
public sealed record RunCurrentTrackResponse(
    int Position, int Round, int PositionInRound, string? PreviewUrl, decimal ListenSeconds, string? Waveform = null);

/// <summary>Un morceau que le serveur vient de neutraliser (Deezer n'en a plus d'extrait), pour l'écran « morceau retiré de la manche ».</summary>
/// <param name="ObjectiveBefore">L'objectif de la manche avant la neutralisation (l'écran le barre).</param>
/// <param name="ObjectiveAfter">L'objectif recalculé sur les morceaux restants.</param>
public sealed record RunNeutralizedResponse(int Position, int Round, int ObjectiveBefore, int ObjectiveAfter);

/// <summary>Le bilan d'une manche qui vient de se terminer (écran de fin de manche).</summary>
/// <param name="Passed">L'objectif est atteint : la manche suivante est débloquée (ou la partie gagnée si c'était la dernière).</param>
/// <param name="Tracks">Ses morceaux, révélés, avec leurs points.</param>
/// <param name="TotalScore">Le score total de la partie à la fin de cette manche.</param>
public sealed record RunRoundSummaryResponse(int Round, bool Passed, int Score, int Objective, IReadOnlyList<RunTrackResponse> Tracks, int TotalScore);

/// <summary>Une manche passée de la partie en cours : la ligne de palier de la pile (« Disque de bronze · manche 2 · 412 / 333 »).</summary>
/// <param name="Disc">Le disque que cette manche a fait gagner (la clé de traduction).</param>
/// <param name="Difficulty">La difficulté à laquelle elle a été jouée.</param>
public sealed record RunPassedRoundResponse(int Round, int Score, int Objective, RunDiscResponse Disc, string Difficulty);

/// <summary>Le score d'une manche à l'écran de fin ; score, objectif et difficulté vides pour une manche non jouée.</summary>
public sealed record RunRoundScoreResponse(int Round, int? Score, int? Objective, bool Passed, string? Difficulty);

/// <param name="Key">La clé de traduction du disque (<c>runs.discs.gold</c>), jamais un texte.</param>
/// <param name="Stars">Ses étoiles au-delà de l'échelle des disques (0 sinon).</param>
public sealed record RunDiscResponse(string Key, int Stars);

/// <summary>Le record du joueur.</summary>
/// <param name="IsNew">Cette partie vient de l'établir (« Nouveau record »).</param>
public sealed record RunRecordResponse(int BestScore, int BestRoundsPassed, bool IsNew);

/// <summary>Le résultat d'une partie finie (écran de fin).</summary>
/// <param name="Status"><c>won</c>, <c>lost</c> ou <c>abandoned</c>.</param>
/// <param name="FoundCount">Morceaux trouvés (artiste et titre justes).</param>
/// <param name="TrackCount">Morceaux de la playlist (les carrés de l'écran de fin) ; ceux qui manquent à <paramref name="Tracks"/> n'ont pas été joués.</param>
/// <param name="Tracks">Chaque morceau joué, par position.</param>
/// <param name="Rounds">Chaque manche de la playlist, jouée ou non.</param>
/// <param name="Record">Le record du joueur ; vide s'il n'en a pas encore (une partie abandonnée ne compte pas).</param>
/// <param name="ChallengeCode">Le code de la playlist, pour la partager.</param>
public sealed record RunFinishResponse(
    string Status, RunDiscResponse Disc, int TotalScore, int RoundsPassed, int FoundCount, int TrackCount,
    IReadOnlyList<RunTrackResponse> Tracks, IReadOnlyList<RunRoundScoreResponse> Rounds, RunRecordResponse? Record, string ChallengeCode);

/// <summary>L'état d'une partie : en-tête, jauge et pastilles de la manche en cours, ou le résultat de fin.</summary>
/// <param name="Status"><c>pending</c>, <c>won</c>, <c>lost</c> ou <c>abandoned</c>.</param>
/// <param name="Rounds">Les manches de la playlist (règles figées).</param>
/// <param name="ListenSeconds">
/// L'écoute normale d'un morceau (règles figées) ; celle du morceau en cours, qui suit la difficulté et les cartes, est
/// <see cref="RunCurrentTrackResponse.ListenSeconds"/> et fait foi.
/// </param>
/// <param name="Round">La manche en cours ; vide une fois la partie finie.</param>
/// <param name="RoundTracks">Les morceaux déjà joués de la manche en cours (les pastilles), neutralisés compris.</param>
/// <param name="Finish">Le résultat de fin ; vide tant que la partie est en cours.</param>
/// <param name="AnswerSeconds">Le chrono d'un morceau (règles figées) ; 0 : pas de chrono.</param>
/// <param name="ClockRemainingSeconds">Ce qui reste au chrono du morceau en cours s'il est parti (une reprise en plein morceau), vide sinon.</param>
/// <param name="PlayedTracks">Tous les morceaux déjà joués de la partie, toutes manches, par position (la pile de l'écran de jeu).</param>
/// <param name="PassedRounds">Les manches déjà passées (les lignes de palier de la pile).</param>
/// <param name="DifficultyChoice">
/// Le choix de difficulté de la manche en cours, tant que le joueur peut le faire (avant le premier son de la manche) ; vide sinon. Sans choix, la
/// manche se joue en « Sûre ».
/// </param>
public sealed record RunSessionResponse(
    int SessionId, string ChallengeCode, string Status, int Rounds, int TracksPerRound, decimal ListenSeconds, int TotalScore, int RoundsPassed,
    RunRoundResponse? Round, IReadOnlyList<RunTrackResponse> RoundTracks, RunFinishResponse? Finish,
    int AnswerSeconds, decimal? ClockRemainingSeconds, IReadOnlyList<RunTrackResponse> PlayedTracks, IReadOnlyList<RunPassedRoundResponse> PassedRounds,
    RunDifficultyChoiceResponse? DifficultyChoice = null);

/// <summary>
/// Ce que rendent le lancement, le démarrage ou la reprise, la redemande d'extrait et la réponse : l'état à jour, puis, dans l'ordre des manches, ce
/// qui vient de se passer (morceaux neutralisés, manches terminées), et le morceau à jouer s'il en reste un. Le clic « Morceau suivant » lance son
/// extrait sans aller-retour (iPhone, pièges 44 et 46).
/// </summary>
/// <param name="Revealed">Le morceau auquel le joueur vient de répondre (réponse à <c>answers</c> seulement).</param>
/// <param name="Neutralized">Les morceaux neutralisés en cherchant le morceau suivant (le plus souvent aucun).</param>
/// <param name="RoundSummaries">Les manches qui viennent de se terminer (le plus souvent aucune, ou une).</param>
/// <param name="Current">
/// Le morceau à jouer ; vide une fois la partie finie, ou tant que la difficulté de la manche est à choisir (<see cref="RunSessionResponse.DifficultyChoice"/> :
/// le choix le donne).
/// </param>
/// <param name="IsResuming">La partie existait déjà (reprise).</param>
public sealed record RunPlayResponse(
    RunSessionResponse Session, RunTrackResponse? Revealed, IReadOnlyList<RunNeutralizedResponse> Neutralized,
    IReadOnlyList<RunRoundSummaryResponse> RoundSummaries, RunCurrentTrackResponse? Current, bool IsResuming);

/// <summary>Le chrono du morceau en cours, tel que le serveur l'a retenu à l'annonce du premier son.</summary>
/// <param name="ClockRemainingSeconds">Ce qui lui reste ; vide pour une playlist sans chrono.</param>
public sealed record RunClockResponse(decimal? ClockRemainingSeconds);

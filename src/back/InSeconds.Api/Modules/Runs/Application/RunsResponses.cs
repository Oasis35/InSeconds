namespace InSeconds.Api.Modules.Runs.Application;

// Ce que portent les réponses des routes de la partie, dicté par les écrans (docs/runs/ecrans.md). **Rien qui identifie un morceau avant
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

/// <summary>La manche en cours.</summary>
/// <param name="Score">Les points déjà marqués dans la manche.</param>
/// <param name="ListenSeconds">L'écoute d'un morceau de la manche (son palier).</param>
/// <param name="FullPoints">Ce que rapporte un morceau trouvé en entier à ce palier.</param>
/// <param name="Failed">Les morceaux ratés (une vie perdue chacun) dans la manche : la manche n'est pas « sans erreur ».</param>
public sealed record RunRoundResponse(int Round, int Score, decimal ListenSeconds, int FullPoints, int Failed);

/// <summary>Le morceau à jouer maintenant.</summary>
/// <param name="PositionInRound">Sa place dans la manche (« Morceau 3 sur 5 »).</param>
/// <param name="PreviewUrl">
/// L'extrait signé et périssable (piège 14) ; vide si Deezer n'a pas répondu (panne, quota) : le joueur réessaie par <c>POST …/preview</c>, le
/// morceau reste en cours.
/// </param>
/// <param name="ListenSeconds">
/// Son écoute, au palier de sa manche : c'est elle qui fait foi.
/// </param>
/// <param name="Waveform">La forme de l'extrait en base64 (cf. <c>TrackSlot</c> du Daily), vide si elle n'est pas calculée : le navigateur calcule la sienne.</param>
public sealed record RunCurrentTrackResponse(
    int Position, int Round, int PositionInRound, string? PreviewUrl, decimal ListenSeconds, string? Waveform = null);

/// <summary>Un morceau que le serveur vient de neutraliser (Deezer n'en a plus d'extrait), pour l'écran « morceau retiré de la manche ».</summary>
public sealed record RunNeutralizedResponse(int Position, int Round);

/// <summary>Le bilan d'une manche qui vient de se terminer (écran de fin de manche).</summary>
/// <param name="Score">Les points de la manche.</param>
/// <param name="Outcome"><c>shorter</c> (sans erreur : le palier raccourcit), <c>same</c> (le palier ne bouge pas) ou <c>longer</c> (une erreur : il s'allonge).</param>
/// <param name="ListenSeconds">L'écoute de la manche qui se termine.</param>
/// <param name="NextListenSeconds">L'écoute de la manche suivante.</param>
/// <param name="Tracks">Ses morceaux, révélés, avec leurs points.</param>
/// <param name="TotalScore">Le score total de la partie à la fin de cette manche.</param>
/// <param name="LivesLeft">Les vies qui restent.</param>
public sealed record RunRoundSummaryResponse(
    int Round, int Score, string Outcome, decimal ListenSeconds, decimal NextListenSeconds, IReadOnlyList<RunTrackResponse> Tracks, int TotalScore,
    int LivesLeft);

/// <summary>Une manche déjà jouée : une ligne de la pile.</summary>
public sealed record RunPassedRoundResponse(int Round, int Score, decimal ListenSeconds, string? Theme);

/// <summary>Le score d'une manche à l'écran de fin ; vide pour une manche non jouée.</summary>
public sealed record RunRoundScoreResponse(int Round, int? Score, decimal ListenSeconds, string? Theme);

/// <param name="Key">La clé de traduction du disque (<c>runs.discs.gold</c>), jamais un texte.</param>
/// <param name="Stars">Ses étoiles au-delà de l'échelle des disques (0 sinon).</param>
public sealed record RunDiscResponse(string Key, int Stars);

/// <summary>Le record du joueur.</summary>
/// <param name="IsNew">Cette partie vient de l'établir (« Nouveau record »).</param>
public sealed record RunRecordResponse(int BestScore, int BestRoundsPassed, bool IsNew);

/// <summary>
/// Le niveau du joueur : la moyenne glissante de ses dernières parties finies, son disque de niveau et ce qu'il lui reste pour le suivant. Rien
/// qui identifie un morceau, aucun classement.
/// </summary>
/// <param name="Points">Ses points de niveau.</param>
/// <param name="Disc">Son disque de niveau (clé <c>runs.discs.*</c>, jamais de texte).</param>
/// <param name="NextDisc">Le disque suivant ; vide au dernier.</param>
/// <param name="PointsToNext">Ce qui lui manque pour le disque suivant (« Encore 220 pour l'Or ») ; vide au dernier disque.</param>
/// <param name="ProgressPercent">Sa progression entre son disque et le suivant, de 0 à 100.</param>
/// <param name="Provisional">Le niveau est provisoire : il a fini moins de parties que <c>Runs:Levels:ProvisionalRuns</c>.</param>
/// <param name="RunsPlayed">Les parties finies (gagnées ou perdues) prises en compte.</param>
/// <param name="Delta">Ce que la partie qui vient de finir a changé aux points (« +38 ») ; vide hors de l'écran de fin de cette partie.</param>
public sealed record RunLevelResponse(
    int Points, RunDiscResponse Disc, RunDiscResponse? NextDisc, int? PointsToNext, int ProgressPercent, bool Provisional, int RunsPlayed, int? Delta);

/// <summary>Le résultat d'une partie finie (écran de fin).</summary>
/// <param name="Status"><c>lost</c> (plus de vie) ou <c>abandoned</c>.</param>
/// <param name="FoundCount">Morceaux trouvés (artiste et titre justes).</param>
/// <param name="TrackCount">Morceaux joués (neutralisés exclus).</param>
/// <param name="Tracks">Chaque morceau joué, par position.</param>
/// <param name="Rounds">Chaque manche jouée (même entamée), avec son score.</param>
/// <param name="Record">Le record du joueur ; vide s'il n'en a pas encore (une partie abandonnée ne compte pas).</param>
/// <param name="ChallengeCode">Le code de la playlist, pour la partager.</param>
/// <param name="Level">
/// Le niveau du joueur après cette partie, avec ce qu'elle lui a fait gagner ou perdre (<c>delta</c>) ; vide si le joueur n'a encore fini aucune partie.
/// </param>
public sealed record RunFinishResponse(
    string Status, int TotalScore, int RoundsPassed, int FoundCount, int TrackCount,
    IReadOnlyList<RunTrackResponse> Tracks, IReadOnlyList<RunRoundScoreResponse> Rounds, RunRecordResponse? Record, string ChallengeCode,
    RunLevelResponse? Level = null);

/// <summary>L'état d'une partie : en-tête (vies, score), manche en cours, ou le résultat de fin.</summary>
/// <param name="Status"><c>pending</c>, <c>lost</c> ou <c>abandoned</c>.</param>
/// <param name="TracksPerRound">Les morceaux d'une manche.</param>
/// <param name="Lives">Les vies au départ.</param>
/// <param name="LivesLeft">Les vies qui restent.</param>
/// <param name="RoundsPassed">Les manches terminées.</param>
/// <param name="Round">La manche en cours ; vide une fois la partie finie.</param>
/// <param name="RoundTracks">Les morceaux déjà joués de la manche en cours (les pastilles), neutralisés compris.</param>
/// <param name="Finish">Le résultat de fin ; vide tant que la partie est en cours.</param>
/// <param name="AnswerSeconds">Le chrono d'un morceau (règles figées) ; 0 : pas de chrono.</param>
/// <param name="ClockRemainingSeconds">Ce qui reste au chrono du morceau en cours s'il est parti (une reprise en plein morceau), vide sinon.</param>
/// <param name="PlayedTracks">Tous les morceaux déjà joués de la partie, toutes manches, par position (la pile de l'écran de jeu).</param>
/// <param name="PassedRounds">Les manches déjà terminées (les lignes de la pile).</param>
/// <param name="Themes">Les manches à thème de la playlist dont le thème est choisi (jamais la première), pour l'annoncer ; vide : aucune.</param>
/// <param name="ThemeChoice">Le choix du thème de la manche à venir, tant que personne ne l'a fait (avant son premier son) ; vide sinon.</param>
/// <param name="Ghost">Le fantôme de l'ami qui a lancé la playlist, s'il l'a finie ; vide sinon. Gardé à la fin de la partie du joueur : c'est le duel de l'écran de fin.</param>
public sealed record RunSessionResponse(
    int SessionId, string ChallengeCode, string Status, int TracksPerRound, int Lives, int LivesLeft, int TotalScore, int RoundsPassed,
    RunRoundResponse? Round, IReadOnlyList<RunTrackResponse> RoundTracks, RunFinishResponse? Finish,
    int AnswerSeconds, decimal? ClockRemainingSeconds, IReadOnlyList<RunTrackResponse> PlayedTracks, IReadOnlyList<RunPassedRoundResponse> PassedRounds,
    RunGhostResponse? Ghost = null, IReadOnlyList<RunRoundThemeResponse>? Themes = null, RunThemeChoiceResponse? ThemeChoice = null);

/// <summary>
/// Le choix du thème de la manche en cours, que seul le créateur de la playlist fait, juste avant de la commencer : deux thèmes proposés, plus le
/// thème mystère (un autre thème, jamais l'un des deux, que le serveur tire quand le choix est vide).
/// </summary>
/// <param name="Round">La manche qui aura ce thème.</param>
public sealed record RunThemeChoiceResponse(int Round, IReadOnlyList<RunThemeOfferItem> Themes);

/// <summary>Le thème d'une manche à thème.</summary>
/// <param name="Round">La manche (jamais la première).</param>
/// <param name="Name">Le nom du thème (« Années 80 »), tel qu'il était à la création de la playlist.</param>
public sealed record RunRoundThemeResponse(int Round, string Name);

/// <summary>
/// Le fantôme d'un ami sur la même playlist (l'auteur de la playlist, même pour un joueur qui l'a reçue d'un autre joueur) : son total sur les morceaux que le joueur a joués, jusqu'au dernier
/// qu'il a répondu (rien d'avance). L'écart se lit morceau par morceau ; rien n'y identifie un morceau.
/// </summary>
/// <param name="Pseudo">
/// Son pseudo ; vide pour un invité (« Invité » à l'écran). Un auteur dont le compte est effacé n'a plus de fantôme : ses parties sont supprimées et
/// la playlist n'a plus d'auteur.
/// </param>
/// <param name="Total">Son total sur les morceaux que le joueur a joués (un morceau retiré au joueur ne compte pas).</param>
/// <param name="StoppedAtRound">La manche où sa partie s'est arrêtée, quand le joueur est allé plus loin ; vide sinon.</param>
public sealed record RunGhostResponse(string? Pseudo, int Total, int? StoppedAtRound);

/// <summary>
/// Ce que rendent le lancement, le démarrage ou la reprise, la redemande d'extrait et la réponse : l'état à jour, puis, dans l'ordre des manches, ce
/// qui vient de se passer (morceaux neutralisés, manches terminées), et le morceau à jouer s'il en reste un. Le clic « Morceau suivant » lance son
/// extrait sans aller-retour (iPhone, pièges 44 et 46).
/// </summary>
/// <param name="Revealed">Le morceau auquel le joueur vient de répondre (réponse à <c>answers</c> seulement).</param>
/// <param name="Neutralized">Les morceaux neutralisés en cherchant le morceau suivant (le plus souvent aucun).</param>
/// <param name="RoundSummaries">Les manches qui viennent de se terminer (le plus souvent aucune, ou une).</param>
/// <param name="Current">
/// Le morceau à jouer ; vide une fois la partie finie, ou tant que le thème de la manche est à choisir (<see cref="RunSessionResponse.ThemeChoice"/> :
/// le choix le donne).
/// </param>
/// <param name="IsResuming">La partie existait déjà (reprise).</param>
public sealed record RunPlayResponse(
    RunSessionResponse Session, RunTrackResponse? Revealed, IReadOnlyList<RunNeutralizedResponse> Neutralized,
    IReadOnlyList<RunRoundSummaryResponse> RoundSummaries, RunCurrentTrackResponse? Current, bool IsResuming);

/// <summary>Le chrono du morceau en cours, tel que le serveur l'a retenu à l'annonce du premier son.</summary>
/// <param name="ClockRemainingSeconds">Ce qui lui reste ; vide pour une playlist sans chrono.</param>
public sealed record RunClockResponse(decimal? ClockRemainingSeconds);

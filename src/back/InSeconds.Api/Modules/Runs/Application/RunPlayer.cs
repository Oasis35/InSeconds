using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Une partie et le défi qu'elle joue, avec les morceaux **déjà tirés** du défi tels que Catalogue les décrit.</summary>
public sealed record LoadedRun(RunSession Session, RunChallenge Challenge, IReadOnlyDictionary<int, TrackInfo> Tracks)
{
    public RunChallengeTrack? TrackAt(int position) => Challenge.TrackAt(position);

    public TrackInfo InfoAt(int position) => Tracks[Challenge.TrackAt(position)!.TrackId];
}

/// <summary>
/// Ce que font toutes les routes qui font avancer une partie, dans la transaction de la requête : tirer la manche qui vient (la première arrivée la
/// tire pour tous), chercher l'extrait du morceau en cours, le **neutraliser** si Deezer confirme qu'il n'en a plus (jamais sur demande du client ;
/// une panne ou un quota laisse le morceau en cours), mettre à jour le record et le niveau à la fin de la partie, et construire la réponse.
/// </summary>
public sealed class RunPlayer(
    ITrackDirectory directory,
    RunRoundDealer roundDealer,
    ITrackPreviews previews,
    ITrackWaveforms waveforms,
    IRunsStore store,
    RunGhosts ghosts,
    IRunScoringPolicy scoring,
    RunsRules rules,
    TimeProvider time,
    RunsMetrics metrics,
    ILogger<RunPlayer> logger)
{
    public IRunScoringPolicy Scoring => scoring;

    /// <summary>Les morceaux déjà tirés du défi de cette partie (noms, pochette, identifiant Deezer), en une lecture.</summary>
    public async Task<LoadedRun> LoadAsync(RunSession session, RunChallenge challenge, CancellationToken ct) =>
        new(session, challenge, await directory.GetAsync(challenge.Tracks.Select(t => t.TrackId).Distinct().ToList(), ct));

    /// <summary>
    /// Fait avancer la partie jusqu'au morceau à jouer : <paramref name="answered"/> est ce que la réponse du joueur vient de faire (vide pour un
    /// démarrage, une reprise ou une redemande d'extrait), <paramref name="revealed"/> le morceau qu'elle révèle.
    /// </summary>
    public async Task<RunPlayResponse> AdvanceAsync(
        LoadedRun run, RunStep? answered, RunTrackResponse? revealed, bool isResuming, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(run);
        var (session, challenge, _) = run;
        var neutralized = new List<RunNeutralizedResponse>();
        var summaries = new List<RunRoundSummaryResponse>();
        if (answered is { Outcome: RunStepOutcome.RoundDone })
            AddSummary(run, answered, summaries);
        var ended = answered is { EndsRun: true };

        RunCurrentTrackResponse? current = null;
        while (session.IsPending)
        {
            // La manche qui vient n'est pas encore tirée : le premier joueur qui y arrive la tire pour tous, avec le thème qu'il choisit (rien ne part
            // avant son choix). Sans offre (moins de trois thèmes fournis), la manche se tire sans thème.
            var round = challenge.Rules.RoundOf(session.NextPosition);
            if (!challenge.HasRound(round))
            {
                if (await roundDealer.OfferAsync(challenge, round, ct) is not null)
                    break;
                await roundDealer.DealAsync(challenge, round, themeId: null, ct);
                run = await LoadAsync(session, challenge, ct);
            }

            var track = run.TrackAt(session.NextPosition)!;
            var info = run.Tracks[track.TrackId];
            var preview = await previews.GetAsync(info, ct);
            if (preview.Availability != PreviewAvailability.Missing)
            {
                if (preview.Availability == PreviewAvailability.Unavailable)
                    RunsLog.PreviewUnavailable(logger, track.TrackId, session.Id);
                // La forme du morceau qui va se jouer (jamais d'un morceau dont l'extrait n'a pas répondu : il n'y a rien à dessiner).
                string? waveform = null;
                if (preview.Url is not null && (await waveforms.GetAsync([track.TrackId], ct)).TryGetValue(track.TrackId, out var shape))
                    waveform = Convert.ToBase64String(shape);
                current = RunViews.Current(session, challenge, track, preview.Url, waveform);
                // Le chrono du morceau ne peut pas partir plus tard qu'un peu après ce premier envoi (une reprise ne le remet pas à zéro).
                if (preview.Url is not null)
                    session.ServeCurrent(time.GetUtcNow());
                break;
            }

            var step = session.Neutralize(challenge, time.GetUtcNow());
            neutralized.Add(new RunNeutralizedResponse(track.Position, track.Round));
            RunsLog.TrackNeutralized(logger, track.TrackId, session.Id, track.Position, track.Round);
            metrics.TrackNeutralized();
            if (step.Outcome == RunStepOutcome.RoundDone)
                AddSummary(run, step, summaries);
            ended |= step.EndsRun;
        }

        if (ended)
            await EndAsync(session, run.Challenge, ct);

        // Les formes des morceaux déjà joués ne partent qu'au démarrage ou à la reprise : après une réponse, le navigateur les a déjà.
        return new RunPlayResponse(await StateAsync(run, ct, withWaveforms: answered is null), revealed, neutralized, summaries, current, isResuming);
    }

    /// <summary>
    /// L'état de la partie (en-tête, manche en cours, pile des morceaux joués, ou résultat de fin). <paramref name="withWaveforms"/> : la forme de
    /// chaque morceau déjà joué, pour redessiner la pile (démarrage, reprise).
    /// </summary>
    public async Task<RunSessionResponse> StateAsync(LoadedRun run, CancellationToken ct, bool withWaveforms = false)
    {
        ArgumentNullException.ThrowIfNull(run);
        var record = run.Session.IsPending ? null : await store.FindRecordAsync(run.Session.PlayerId, ct);
        var level = run.Session.IsPending ? null : await store.FindLevelAsync(run.Session.PlayerId, ct);
        RunThemeOffer? themeOffer = null;
        if (run.Session.IsPending)
        {
            var round = run.Challenge.Rules.RoundOf(run.Session.NextPosition);
            themeOffer = await roundDealer.OfferAsync(run.Challenge, round, ct);
        }

        IReadOnlyDictionary<int, byte[]> shapes = new Dictionary<int, byte[]>();
        if (withWaveforms && run.Session.IsPending)
        {
            // Seulement des morceaux déjà répondus (jamais un morceau à venir, piège 31) ; leur absence a déjà été signalée quand ils se jouaient.
            var played = run.Session.Answers.Where(a => !a.Neutralized).Select(a => run.TrackAt(a.Position)!.TrackId).ToList();
            if (played.Count > 0)
                shapes = await waveforms.GetAsync(played, ct, reportMissing: false);
        }

        return RunViews.Session(run, scoring, record, shapes, time.GetUtcNow(), await ghosts.OfAsync(run.Session, run.Challenge, ct),
            themeOffer, RunViews.LevelOf(level, rules.Levels, run.Session.Id));
    }

    // Le bilan d'une manche terminée, et son compte dans les métriques (la manche ne se termine qu'une fois).
    private void AddSummary(LoadedRun run, RunStep step, List<RunRoundSummaryResponse> summaries)
    {
        var summary = RunViews.Summary(run, step);
        summaries.Add(summary);
        metrics.RoundEnded(step.Round, summary.Outcome);
    }

    // Le record (partie finie : perdue ou Série complète), dans la transaction de fin : une partie abandonnée ne compte pas.
    private async Task EndAsync(RunSession session, RunChallenge challenge, CancellationToken ct)
    {
        await store.LockRecordAsync(session.PlayerId, ct);
        var record = await store.FindRecordAsync(session.PlayerId, ct);
        if (record is null)
            store.AddRecord(RunRecord.First(session, time.GetUtcNow()));
        else
            record.Improve(session, time.GetUtcNow());

        // Le niveau : la moyenne glissante des scores des parties finies (même verrou que le record, une partie ne s'y compte qu'une fois).
        var level = await store.FindLevelAsync(session.PlayerId, ct);
        if (level is null)
        {
            level = RunLevel.Start(session.PlayerId, time.GetUtcNow());
            store.AddLevel(level);
        }

        var pointsBefore = level.Points;
        level.Record(session, rules.Levels.Window, time.GetUtcNow());
        RunsLog.LevelUpdated(logger, session.Id, level.RunsPlayed, level.Points - pointsBefore);
        var ladder = rules.Levels.Ladder;
        metrics.LevelChanged(
            RunLevelPolicy.Standing(pointsBefore, ladder).Current.FromPoints,
            RunLevelPolicy.Standing(level.Points, ladder).Current,
            RunLevelPolicy.IsProvisional(level.RunsPlayed, rules.Levels.ProvisionalRuns));

        RunsLog.SessionEnded(logger, session.Id, session.PlayerId, session.Status, session.RoundsPassed, session.TotalScore);
        metrics.SessionEnded(session.RoundsPassed);
        // Un duel contre l'ami qui a lancé la playlist (s'il l'a finie) : devant, derrière ou à égalité.
        if (await ghosts.OfAsync(session, challenge, ct) is { } ghost)
            metrics.DuelEnded(session.TotalScore - ghost.Total);
    }
}

/// <summary>La forme des réponses, à partir de la partie, du défi et des morceaux.</summary>
internal static class RunViews
{
    /// <summary>Les manches à thème d'une playlist, par manche ; rien quand elle n'en a pas.</summary>
    public static IReadOnlyList<RunRoundThemeResponse>? ThemesOf(RunRules rules) =>
        rules.Themes is { Count: > 0 } themes ? [.. themes.OrderBy(t => t.Round).Select(t => new RunRoundThemeResponse(t.Round, t.Name))] : null;

    /// <summary>
    /// Le niveau d'un joueur tel que l'écran le montre ; <paramref name="sessionId"/> : la partie dont on veut le gain (« +38 »), rien pour l'accueil.
    /// Vide quand le joueur n'a encore fini aucune partie.
    /// </summary>
    public static RunLevelResponse? LevelOf(RunLevel? level, RunLevelOptions options, int? sessionId)
    {
        if (level is null || level.RunsPlayed == 0)
            return null;
        var standing = RunLevelPolicy.Standing(level.Points, options.Ladder);
        return new RunLevelResponse(
            level.Points, new RunDiscResponse(standing.Current.Disc, 0), standing.Next is null ? null : new RunDiscResponse(standing.Next.Disc, 0),
            standing.PointsToNext, standing.ProgressPercent, RunLevelPolicy.IsProvisional(level.RunsPlayed, options.ProvisionalRuns), level.RunsPlayed,
            sessionId is { } id ? level.DeltaOf(id) : null);
    }

    public static string StatusOf(RunSessionStatus status) => status switch
    {
        RunSessionStatus.Pending => "pending",
        RunSessionStatus.Completed => "completed",
        RunSessionStatus.Lost => "lost",
        _ => "abandoned",
    };

    /// <summary>Un morceau joué : révélé (noms, pochette, lien Deezer), sauf s'il a été neutralisé.</summary>
    public static RunTrackResponse Track(LoadedRun run, RunChallengeTrack track, RunAnswer answer, IReadOnlyDictionary<int, byte[]>? shapes = null)
    {
        if (answer.Neutralized)
            return new RunTrackResponse(track.Position, track.Round, true, false, false, 0, null, null, null, null);
        var info = run.Tracks[track.TrackId];
        var waveform = shapes is not null && shapes.TryGetValue(track.TrackId, out var shape) ? Convert.ToBase64String(shape) : null;
        return new RunTrackResponse(
            track.Position, track.Round, false, answer.ArtistCorrect, answer.TitleCorrect, answer.Points,
            info.Artist, info.DisplayTitle, info.CoverUrl, info.DeezerTrackId, waveform);
    }

    /// <summary>Le morceau qui vient de recevoir la réponse du joueur.</summary>
    public static RunTrackResponse Revealed(LoadedRun run, int position)
    {
        var answer = run.Session.Answers.First(a => a.Position == position);
        return Track(run, run.TrackAt(position)!, answer);
    }

    public static RunCurrentTrackResponse Current(
        RunSession session, RunChallenge challenge, RunChallengeTrack track, string? previewUrl, string? waveform) =>
        new(track.Position, track.Round, PositionInRound(challenge, track), previewUrl, session.ListenSecondsOf(challenge.Rules), waveform);

    public static RunRoundSummaryResponse Summary(LoadedRun run, RunStep step)
    {
        var rules = run.Challenge.Rules;
        var outcome = step.ToStep > step.FromStep ? "shorter" : step.ToStep < step.FromStep ? "longer" : "same";
        return new RunRoundSummaryResponse(
            step.Round, RoundScore(run, step.Round), outcome, rules.ListenAt(step.FromStep), rules.ListenAt(step.ToStep), PlayedTracks(run, step.Round),
            run.Session.TotalScore, run.Session.LivesLeft(rules), rules.PointsAt(step.FromStep), rules.PointsAt(step.ToStep),
            run.Session.RegainedLife(rules, step.Round));
    }

    public static RunSessionResponse Session(
        LoadedRun run, IRunScoringPolicy scoring, RunRecord? record, IReadOnlyDictionary<int, byte[]> shapes,
        DateTimeOffset now, RunGhostResponse? ghost, RunThemeOffer? themeOffer = null, RunLevelResponse? level = null)
    {
        var (session, challenge, _) = run;
        var rules = challenge.Rules;
        RunRoundResponse? round = null;
        IReadOnlyList<RunTrackResponse> roundTracks = [];
        RunFinishResponse? finish = null;
        // La pile, partie finie comprise : la dernière réponse s'affiche au-dessus des morceaux déjà joués avant l'écran de fin.
        var playedTracks = session.Answers
            .OrderBy(a => a.Position)
            .Select(a => Track(run, run.TrackAt(a.Position)!, a, shapes))
            .ToList();
        var passedRounds = Enumerable.Range(1, session.RoundsPassed)
            .Select(r => new RunPassedRoundResponse(r, RoundScore(run, r), rules.ListenAt(session.StepOf(rules, r)), rules.ThemeOf(r)?.Name))
            .ToList();
        if (session.IsPending)
        {
            var current = rules.RoundOf(session.NextPosition);
            var step = session.StepOf(rules, current);
            round = new RunRoundResponse(current, RoundScore(run, current), rules.ListenAt(step), rules.PointsAt(step), session.TallyOf(rules, current).Failed);
            roundTracks = challenge.HasRound(current) ? PlayedTracks(run, current) : [];
        }
        else
        {
            finish = Finish(run, record, level);
        }

        return new RunSessionResponse(
            session.Id, challenge.Code, StatusOf(session.Status), rules.TracksPerRound, rules.Lives, session.LivesLeft(rules),
            session.TotalScore, session.RoundsPassed, round, roundTracks, finish,
            rules.AnswerSeconds, session.IsPending ? session.ClockRemaining(rules, now) : null, playedTracks, passedRounds, ghost, ThemesOf(rules),
            themeOffer is null ? null : new RunThemeChoiceResponse(
                themeOffer.Round, [.. themeOffer.Themes.Select(t => new RunThemeOfferItem(t.Id, t.Name, themeOffer.Round, t.Icon))]),
            [.. rules.ListenLadder], rules.MaxRounds);
    }

    private static RunFinishResponse Finish(LoadedRun run, RunRecord? record, RunLevelResponse? level)
    {
        var (session, challenge, _) = run;
        var rules = challenge.Rules;
        var answers = session.Answers.OrderBy(a => a.Position).ToList();
        var tracks = answers.Select(a => Track(run, run.TrackAt(a.Position)!, a)).ToList();
        var rounds = answers.Select(a => rules.RoundOf(a.Position)).Distinct()
            .Select(r => new RunRoundScoreResponse(r, RoundScore(run, r), rules.ListenAt(session.StepOf(rules, r)), rules.ThemeOf(r)?.Name))
            .ToList();
        return new RunFinishResponse(
            StatusOf(session.Status), session.TotalScore, session.RoundsPassed, answers.Count(a => a.IsFull), answers.Count(a => !a.Neutralized), tracks,
            rounds, record is null ? null : new RunRecordResponse(record.BestScore, record.BestRoundsPassed, record.SessionId == session.Id),
            challenge.Code, level, session.LivesLeft(rules),
            session.Status == RunSessionStatus.Completed ? session.LivesLeft(rules) * rules.LifeBonus : 0,
            session.Status == RunSessionStatus.Completed ? rules.CompleteBonus : 0);
    }

    // Les points d'une manche : la somme des points de ses réponses.
    private static int RoundScore(LoadedRun run, int round) =>
        run.Session.Answers.Where(a => run.Challenge.Rules.RoundOf(a.Position) == round).Sum(a => a.Points);

    private static List<RunTrackResponse> PlayedTracks(LoadedRun run, int round) =>
        run.Session.Answers
            .Select(a => (Answer: a, Track: run.TrackAt(a.Position)!))
            .Where(x => x.Track.Round == round)
            .OrderBy(x => x.Track.Position)
            .Select(x => Track(run, x.Track, x.Answer))
            .ToList();

    private static int PositionInRound(RunChallenge challenge, RunChallengeTrack track) =>
        challenge.Rules.RoundOf(track.Position) == 0 ? 0 : track.Position - challenge.Rules.FirstPositionOf(track.Round) + 1;
}

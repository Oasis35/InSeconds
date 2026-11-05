using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Une partie et le défi qu'elle joue, avec les morceaux du défi tels que Catalogue les décrit.</summary>
public sealed record LoadedRun(RunSession Session, RunChallenge Challenge, IReadOnlyDictionary<int, TrackInfo> Tracks)
{
    public RunChallengeTrack? TrackAt(int position) => Challenge.Tracks.FirstOrDefault(t => t.Position == position);
}

/// <summary>
/// Ce que font toutes les routes qui font avancer une partie, dans la transaction de la requête : chercher l'extrait du morceau en cours, le
/// **neutraliser** si Deezer confirme qu'il n'en a plus (jamais sur demande du client ; une panne ou un quota laisse le morceau en cours), mettre à
/// jour le record à la fin de la partie, et construire la réponse.
/// </summary>
public sealed class RunPlayer(
    ITrackDirectory directory,
    ITrackPreviews previews,
    ITrackWaveforms waveforms,
    IRunsStore store,
    IRunScoringPolicy scoring,
    RunsRules rules,
    TimeProvider time,
    RunsMetrics metrics,
    ILogger<RunPlayer> logger)
{
    public IRunScoringPolicy Scoring => scoring;

    /// <summary>Les morceaux du défi de cette partie (noms, pochette, identifiant Deezer), en une lecture.</summary>
    public async Task<LoadedRun> LoadAsync(RunSession session, RunChallenge challenge, CancellationToken ct) =>
        new(session, challenge, await directory.GetAsync(challenge.Tracks.Select(t => t.TrackId).ToList(), ct));

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
        var ended = false;
        if (answered is { EndsRound: true })
        {
            summaries.Add(RunViews.Summary(run, answered, scoring));
            ended = !session.IsPending;
        }

        RunCurrentTrackResponse? current = null;
        while (session.IsPending)
        {
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

            var before = session.RoundProgressOf(challenge, track.Round, scoring).Objective;
            var step = session.Neutralize(challenge, scoring, time.GetUtcNow());
            neutralized.Add(new RunNeutralizedResponse(
                track.Position, track.Round, before, session.RoundProgressOf(challenge, track.Round, scoring).Objective));
            RunsLog.TrackNeutralized(logger, track.TrackId, session.Id, track.Position, track.Round);
            metrics.TrackNeutralized();
            if (step.EndsRound)
                summaries.Add(RunViews.Summary(run, step, scoring));
            ended = !session.IsPending;
        }

        if (ended)
            await EndAsync(session, ct);

        // Les formes des morceaux déjà joués ne partent qu'au démarrage ou à la reprise : après une réponse, le navigateur les a déjà.
        return new RunPlayResponse(await StateAsync(run, ct, withWaveforms: answered is null), revealed, neutralized, summaries, current, isResuming);
    }

    /// <summary>
    /// L'état de la partie (en-tête, jauge, pile des morceaux joués, ou résultat de fin). <paramref name="withWaveforms"/> : la forme de chaque
    /// morceau déjà joué, pour redessiner la pile (démarrage, reprise).
    /// </summary>
    public async Task<RunSessionResponse> StateAsync(LoadedRun run, CancellationToken ct, bool withWaveforms = false)
    {
        ArgumentNullException.ThrowIfNull(run);
        var record = run.Session.IsPending ? null : await store.FindRecordAsync(run.Session.PlayerId, ct);
        IReadOnlyDictionary<int, byte[]> shapes = new Dictionary<int, byte[]>();
        if (withWaveforms && run.Session.IsPending)
        {
            // Seulement des morceaux déjà répondus (jamais un morceau à venir, piège 31) ; leur absence a déjà été signalée quand ils se jouaient.
            var played = run.Session.Answers.Where(a => !a.Neutralized).Select(a => run.TrackAt(a.Position)!.TrackId).ToList();
            if (played.Count > 0)
                shapes = await waveforms.GetAsync(played, ct, reportMissing: false);
        }

        return RunViews.Session(run, scoring, rules.Discs, record, shapes, time.GetUtcNow());
    }

    // Le record (partie gagnée ou perdue), dans la transaction de fin : une partie abandonnée ne compte pas.
    private async Task EndAsync(RunSession session, CancellationToken ct)
    {
        await store.LockRecordAsync(session.PlayerId, ct);
        var record = await store.FindRecordAsync(session.PlayerId, ct);
        if (record is null)
            store.AddRecord(RunRecord.First(session, time.GetUtcNow()));
        else
            record.Improve(session, time.GetUtcNow());

        RunsLog.SessionEnded(logger, session.Id, session.PlayerId, session.Status, session.RoundsPassed, session.TotalScore);
        metrics.SessionEnded(session.Status == RunSessionStatus.Won, DiscLadder.Of(session.RoundsPassed, rules.Discs).Key);
    }
}

/// <summary>La forme des réponses, à partir de la partie, du défi et des morceaux.</summary>
internal static class RunViews
{
    public static string StatusOf(RunSessionStatus status) => status switch
    {
        RunSessionStatus.Pending => "pending",
        RunSessionStatus.Won => "won",
        RunSessionStatus.Lost => "lost",
        _ => "abandoned",
    };

    /// <summary>Un morceau joué : révélé (noms, pochette, lien Deezer), sauf s'il a été neutralisé.</summary>
    public static RunTrackResponse Track(
        RunChallengeTrack track, RunAnswer answer, IReadOnlyDictionary<int, TrackInfo> infos, IReadOnlyDictionary<int, byte[]>? shapes = null)
    {
        if (answer.Neutralized)
            return new RunTrackResponse(track.Position, track.Round, true, false, false, 0, null, null, null, null);
        var info = infos[track.TrackId];
        var waveform = shapes is not null && shapes.TryGetValue(track.TrackId, out var shape) ? Convert.ToBase64String(shape) : null;
        return new RunTrackResponse(
            track.Position, track.Round, false, answer.ArtistCorrect, answer.TitleCorrect, answer.Points,
            info.Artist, info.DisplayTitle, info.CoverUrl, info.DeezerTrackId, waveform);
    }

    /// <summary>Le morceau qui vient de recevoir la réponse du joueur.</summary>
    public static RunTrackResponse Revealed(LoadedRun run, int position)
    {
        var answer = run.Session.Answers.First(a => a.Position == position);
        return Track(run.TrackAt(position)!, answer, run.Tracks);
    }

    public static RunCurrentTrackResponse Current(
        RunSession session, RunChallenge challenge, RunChallengeTrack track, string? previewUrl, string? waveform) =>
        new(track.Position, track.Round, PositionInRound(challenge, track), previewUrl, session.OptionOf(challenge, track.Round).ListenSeconds, waveform);

    public static string DifficultyOf(RoundProgress progress) => RunDifficulties.KeyOf(progress.Difficulty);

    public static RunRoundSummaryResponse Summary(LoadedRun run, RunStep step, IRunScoringPolicy scoring)
    {
        var progress = run.Session.RoundProgressOf(run.Challenge, step.Round, scoring);
        return new RunRoundSummaryResponse(
            step.Round, step.Outcome != RunStepOutcome.Lost, progress.Score, progress.Objective, PlayedTracks(run, step.Round), run.Session.TotalScore);
    }

    public static RunSessionResponse Session(
        LoadedRun run, IRunScoringPolicy scoring, IReadOnlyList<string> discs, RunRecord? record, IReadOnlyDictionary<int, byte[]> shapes,
        DateTimeOffset now)
    {
        var (session, challenge, _) = run;
        var rules = challenge.Rules;
        RunRoundResponse? round = null;
        IReadOnlyList<RunTrackResponse> roundTracks = [];
        RunFinishResponse? finish = null;
        // La pile, partie finie comprise : la dernière réponse s'affiche au-dessus des morceaux déjà joués avant l'écran de fin.
        var playedTracks = session.Answers
            .OrderBy(a => a.Position)
            .Select(a => Track(run.TrackAt(a.Position)!, a, run.Tracks, shapes))
            .ToList();
        // Les manches passées sont les premières : la partie s'arrête à la première manche ratée.
        var passedRounds = Enumerable.Range(1, session.RoundsPassed).Select(r =>
        {
            var passed = session.RoundProgressOf(challenge, r, scoring);
            var disc = DiscLadder.Of(r, discs);
            return new RunPassedRoundResponse(r, passed.Score, passed.Objective, new RunDiscResponse(disc.Key, disc.Stars), DifficultyOf(passed));
        }).ToList();
        RunDifficultyChoiceResponse? choice = null;
        if (session.IsPending)
        {
            var current = run.TrackAt(session.NextPosition)!.Round;
            var progress = session.RoundProgressOf(challenge, current, scoring);
            round = new RunRoundResponse(current, progress.Score, progress.Objective, progress.MaxScore, DifficultyOf(progress));
            roundTracks = PlayedTracks(run, current);
            if (session.CanChooseDifficulty(challenge, current))
                choice = DifficultyChoice(run, current, scoring);
        }
        else
        {
            finish = Finish(run, scoring, discs, record);
        }

        return new RunSessionResponse(
            session.Id, challenge.Code, StatusOf(session.Status), RoundsOf(challenge).Count, rules.TracksPerRound, rules.ListenSeconds,
            session.TotalScore, session.RoundsPassed, round, roundTracks, finish,
            rules.AnswerSeconds, session.IsPending ? session.ClockRemaining(rules, now) : null, playedTracks, passedRounds, choice);
    }

    // Chaque difficulté proposée, calculée sur les morceaux de la manche (un morceau déjà neutralisé en est retiré, comme pour la jauge).
    private static RunDifficultyChoiceResponse DifficultyChoice(LoadedRun run, int round, IRunScoringPolicy scoring) =>
        new(round, run.Challenge.Rules.OptionsOf(round).OrderBy(o => o.Difficulty).Select(option =>
        {
            var progress = RunGauge.Of(run.Challenge, run.Session.Answers, round, scoring, option);
            return new RunDifficultyOptionResponse(RunDifficulties.KeyOf(option.Difficulty), progress.Objective, progress.MaxScore, option.ListenSeconds);
        }).ToList());

    private static RunFinishResponse Finish(LoadedRun run, IRunScoringPolicy scoring, IReadOnlyList<string> discs, RunRecord? record)
    {
        var (session, challenge, _) = run;
        var answers = session.Answers.OrderBy(a => a.Position).ToList();
        var tracks = answers.Select(a => Track(run.TrackAt(a.Position)!, a, run.Tracks)).ToList();
        var rounds = RoundsOf(challenge).Select(r =>
        {
            var played = challenge.Tracks.Any(t => t.Round == r && answers.Exists(a => a.Position == t.Position));
            var progress = session.RoundProgressOf(challenge, r, scoring);
            return new RunRoundScoreResponse(
                r, played ? progress.Score : null, played ? progress.Objective : null, r <= session.RoundsPassed, played ? DifficultyOf(progress) : null);
        }).ToList();
        var disc = DiscLadder.Of(session.RoundsPassed, discs);

        return new RunFinishResponse(
            StatusOf(session.Status), new RunDiscResponse(disc.Key, disc.Stars), session.TotalScore, session.RoundsPassed,
            answers.Count(a => a.ArtistCorrect && a.TitleCorrect), challenge.Tracks.Count, tracks, rounds,
            record is null ? null : new RunRecordResponse(record.BestScore, record.BestRoundsPassed, record.SessionId == session.Id),
            challenge.Code);
    }

    private static List<RunTrackResponse> PlayedTracks(LoadedRun run, int round) =>
        run.Session.Answers
            .Select(a => (Answer: a, Track: run.TrackAt(a.Position)!))
            .Where(x => x.Track.Round == round)
            .OrderBy(x => x.Track.Position)
            .Select(x => Track(x.Track, x.Answer, run.Tracks))
            .ToList();

    /// <summary>Les manches du défi, d'après ses morceaux (le nombre réel, piège 38).</summary>
    private static List<int> RoundsOf(RunChallenge challenge) =>
        challenge.Tracks.Select(t => (int)t.Round).Distinct().Order().ToList();

    private static int PositionInRound(RunChallenge challenge, RunChallengeTrack track) =>
        challenge.Tracks.Count(t => t.Round == track.Round && t.Position <= track.Position);
}

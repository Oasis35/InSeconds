import {
  RoundConfig, TrackRound, applyHints, askSkip, availableHintLevels, beginListening, cancelConfirm, confirmPending,
  createRound, isAnswering, listenMore, maxStep, nextStep, onAudio, retryPlayback, retrySubmission, reveal, showsInput,
  skipUnplayable, submissionFailed, submitAnswer, unlockedHintLevel,
} from './track-round';

const CONFIG: RoundConfig = {
  trackId: 7,
  previewUrl: 'https://cdn.example/extrait.mp3',
  listen: { steps: [0.5, 1, 2, 5, 10], extendable: true },
  hints: { unlockSeconds: [5, 10] },
};

const round = (overrides: Partial<RoundConfig> = {}): TrackRound => createRound({ ...CONFIG, ...overrides });
const started = (overrides: Partial<RoundConfig> = {}): TrackRound => beginListening(round(overrides));
const playing = (r: TrackRound): TrackRound => onAudio(r, 'playing');
const listened = (r: TrackRound): TrackRound => onAudio(r, 'finished');
const answer = { artist: 'Daft Punk', title: 'Get Lucky' };

describe('createRound', () => {
  it('démarre à « ready » avec les paliers du mode', () => {
    const r = round();
    expect(r.phase).toBe('ready');
    expect(r.steps).toEqual([0.5, 1, 2, 5, 10]);
    expect(r.chosenSeconds).toBe(0);
    expect(r.extended).toBe(false);
  });

  it('trie les paliers et retire les doublons et les valeurs nulles', () => {
    expect(round({ listen: { steps: [2, 0, 1, 2], extendable: true } }).steps).toEqual([1, 2]);
  });

  it('retire les paliers sous le plancher d\'écoute (reprise, piège 35)', () => {
    expect(round({ listenedFloor: 2 }).steps).toEqual([2, 5, 10]);
    expect(round({ listenedFloor: 1.5 }).steps).toEqual([2, 5, 10]);
  });

  it.each([null, ''])('un morceau sans extrait (%j) est « no-preview »', previewUrl => {
    expect(round({ previewUrl }).phase).toBe('no-preview');
  });

  it('sans palier possible, la manche n\'est pas jouable', () => {
    expect(round({ listenedFloor: 11 }).phase).toBe('no-preview');
  });

  it('reprend le niveau d\'indice déjà révélé', () => {
    const r = round({ hintLevel: 1, hintFacts: [{ kind: 'year', value: '2013' }] });
    expect(r.hintLevel).toBe(1);
    expect(r.hints).toEqual([{ kind: 'year', value: '2013' }]);
  });
});

describe('beginListening', () => {
  it('lance l\'écoute au premier palier', () => {
    const r = started();
    expect(r.phase).toBe('loading');
    expect(r.chosenSeconds).toBe(0.5);
    expect(r.autoStarted).toBe(true);
  });

  it('démarre au premier palier encore permis après une reprise', () => {
    expect(started({ listenedFloor: 2 }).chosenSeconds).toBe(2);
  });

  it('n\'a lieu qu\'une fois par morceau (piège 44)', () => {
    const r = started();
    expect(beginListening(r)).toBe(r);
    // même si le lecteur revenait au repos, la manche n'a pas à repartir du premier palier
    const resting: TrackRound = { ...listenMore(r), phase: 'ready' };
    expect(beginListening(resting)).toBe(resting);
    expect(resting.chosenSeconds).toBe(1);
  });

  it('ne fait rien sans extrait', () => {
    const r = round({ previewUrl: null });
    expect(beginListening(r)).toBe(r);
  });
});

describe('onAudio', () => {
  it('suit le lecteur : chargement, lecture, palier joué', () => {
    let r = started();
    r = playing(r);
    expect(r.phase).toBe('playing');
    r = listened(r);
    expect(r.phase).toBe('listened');
    expect(onAudio(r, 'loading').phase).toBe('loading');
  });

  it('un retour à « idle » ne change rien (jamais de relance silencieuse, pièges 33 et 44)', () => {
    const r = playing(started());
    expect(onAudio(r, 'idle')).toBe(r);
  });

  it('une erreur de lecture reste une erreur, même si le lecteur annonce autre chose ensuite', () => {
    const failed = onAudio(playing(started()), 'error');
    expect(failed.phase).toBe('audio-error');
    expect(onAudio(failed, 'playing')).toBe(failed);
    expect(onAudio(failed, 'idle')).toBe(failed);
    expect(onAudio(failed, 'finished')).toBe(failed);
  });

  it('ne touche pas une manche déjà répondue', () => {
    const r = submitAnswer(listened(started()), answer);
    expect(onAudio(r, 'error')).toBe(r);
  });

  it('ne touche pas une manche qui n\'a pas démarré', () => {
    const r = round();
    expect(onAudio(r, 'playing')).toBe(r);
  });
});

describe('listenMore', () => {
  it('passe au palier suivant et note la prolongation', () => {
    const r = listenMore(playing(started()));
    expect(r.chosenSeconds).toBe(1);
    expect(r.extended).toBe(true);
  });

  it('relance la lecture après un palier joué', () => {
    expect(listenMore(listened(started())).phase).toBe('playing');
  });

  it('marche pendant le chargement (piège 40)', () => {
    const r = listenMore(started());
    expect(r.phase).toBe('loading');
    expect(r.chosenSeconds).toBe(1);
    expect(r.extended).toBe(true);
  });

  it('peut se chaîner jusqu\'au dernier palier, puis s\'arrête', () => {
    let r = started();
    for (const expected of [1, 2, 5, 10]) {
      r = listenMore(r);
      expect(r.chosenSeconds).toBe(expected);
    }
    expect(nextStep(r)).toBeNull();
    expect(listenMore(r)).toBe(r);
  });

  it('est refusé quand le mode ne permet pas de prolonger', () => {
    const r = started({ listen: { steps: [10], extendable: false } });
    expect(nextStep(r)).toBeNull();
    expect(listenMore(r)).toBe(r);
  });

  it('est refusé hors écoute (erreur, réponse envoyée)', () => {
    const failed = onAudio(started(), 'error');
    expect(listenMore(failed)).toBe(failed);
    const sent = submitAnswer(listened(started()), answer);
    expect(listenMore(sent)).toBe(sent);
  });

  it('une relecture ne change pas l\'état : wasExtended reste vrai (piège 40)', () => {
    const r = listened(listenMore(playing(started())));
    // le lecteur rejoue le même palier : la manche ne voit qu'un nouveau « playing » puis « finished »
    const replayed = listened(playing(r));
    expect(replayed.extended).toBe(true);
    expect(replayed.chosenSeconds).toBe(1);
  });

  it('nextStep et maxStep suivent les paliers restants après une reprise', () => {
    const r = started({ listenedFloor: 2 });
    expect(nextStep(r)).toBe(5);
    expect(maxStep(r)).toBe(10);
  });
});

describe('retryPlayback', () => {
  it('repart au palier choisi', () => {
    const failed = onAudio(listenMore(playing(started())), 'error');
    const r = retryPlayback(failed);
    expect(r.phase).toBe('loading');
    expect(r.chosenSeconds).toBe(1);
    expect(r.extended).toBe(true);
  });

  it('ne fait rien hors erreur de lecture', () => {
    const r = playing(started());
    expect(retryPlayback(r)).toBe(r);
  });
});

describe('indices', () => {
  const at = (seconds: number) => {
    let r = started();
    while (r.chosenSeconds < seconds) r = listenMore(r);
    return r;
  };

  it('se débloquent au palier du réglage, niveau par niveau', () => {
    expect(unlockedHintLevel(at(2))).toBe(0);
    expect(unlockedHintLevel(at(5))).toBe(1);
    expect(unlockedHintLevel(at(10))).toBe(2);
  });

  it('se demandent dans cet ordre : le 1, puis seulement le 2', () => {
    expect(availableHintLevels(at(2))).toEqual([]);
    expect(availableHintLevels(at(5))).toEqual([1]);
    // le palier du niveau 2 est atteint, mais le niveau 1 n'a pas été demandé
    expect(availableHintLevels(at(10))).toEqual([1]);
    const first = applyHints(at(10), 1, [{ kind: 'year', value: '2013' }]);
    expect(availableHintLevels(first)).toEqual([2]);
  });

  it('le niveau suivant attend son palier', () => {
    const first = applyHints(at(5), 1, [{ kind: 'year', value: '2013' }]);
    expect(availableHintLevels(first)).toEqual([]);
    expect(availableHintLevels(listenMore(first))).toEqual([2]);
  });

  it('le nombre de niveaux suit le réglage, jamais une liste en dur', () => {
    const r = started({ hints: { unlockSeconds: [1, 2, 5] } });
    const longer = listenMore(listenMore(listenMore(r))); // 5 s
    expect(availableHintLevels(longer)).toEqual([1]);
    expect(availableHintLevels(applyHints(longer, 2, []))).toEqual([3]);
    expect(availableHintLevels(started({ hints: { unlockSeconds: [] } }))).toEqual([]);
  });

  it('ne proposent plus un niveau révélé, ni ceux du dessous', () => {
    const r = applyHints(at(10), 2, [{ kind: 'year', value: '2013' }, { kind: 'artist', value: 'D___ P___' }]);
    expect(r.hintLevel).toBe(2);
    expect(availableHintLevels(r)).toEqual([]);
    expect(r.hints).toHaveLength(2);
  });

  it('le niveau révélé ne redescend jamais', () => {
    const level2 = applyHints(at(10), 2, [{ kind: 'year', value: '2013' }, { kind: 'artist', value: 'D' }]);
    expect(applyHints(level2, 1, [{ kind: 'year', value: '2013' }])).toBe(level2);
  });

  it('prolonger l\'écoute après un indice ne le retire pas', () => {
    const r = applyHints(at(5), 1, [{ kind: 'year', value: '2013' }]);
    const more = listenMore(r);
    expect(more.hintLevel).toBe(1);
    expect(more.hints).toHaveLength(1);
  });

  it('ne sont plus proposés une fois la réponse envoyée', () => {
    expect(availableHintLevels(submitAnswer(at(10), answer))).toEqual([]);
  });
});

describe('réponse', () => {
  it('envoie le palier écouté, la prolongation et la saisie', () => {
    const r = submitAnswer(listenMore(listened(started())), answer);
    expect(r.phase).toBe('submitting');
    expect(r.submission).toEqual({ trackId: 7, listenedSeconds: 1, wasExtended: true, ...answer });
  });

  it('une réponse vide demande d\'abord confirmation', () => {
    const r = submitAnswer(listened(started()), { artist: null, title: null });
    expect(r.confirm).toBe('empty');
    expect(r.phase).toBe('listened');
    expect(r.submission).toBeNull();
  });

  it('confirmer une réponse vide l\'envoie', () => {
    const asked = submitAnswer(listened(started()), { artist: null, title: null });
    const r = confirmPending(asked, { artist: null, title: null });
    expect(r.phase).toBe('submitting');
    expect(r.submission).toMatchObject({ artist: null, title: null, listenedSeconds: 0.5 });
    expect(r.confirm).toBeNull();
  });

  it('« Passer » demande confirmation, puis envoie une réponse vide même si une saisie existe', () => {
    const asked = askSkip(playing(started()));
    expect(asked.confirm).toBe('skip');
    const r = confirmPending(asked, answer);
    expect(r.submission).toMatchObject({ artist: null, title: null, listenedSeconds: 0.5 });
  });

  it('annuler la confirmation la ferme', () => {
    const asked = askSkip(playing(started()));
    expect(cancelConfirm(asked).confirm).toBeNull();
    expect(cancelConfirm(asked).phase).toBe('playing');
  });

  it('confirmer sans rien à confirmer ne fait rien', () => {
    const r = playing(started());
    expect(confirmPending(r, answer)).toBe(r);
  });

  it('la saisie est possible dès le chargement du son', () => {
    expect(showsInput(started())).toBe(true);
    expect(isAnswering(started())).toBe(true);
    expect(submitAnswer(started(), answer).phase).toBe('submitting');
  });

  it('pas de saisie avant le démarrage, sans extrait ou après une erreur de lecture', () => {
    expect(showsInput(round())).toBe(false);
    expect(showsInput(round({ previewUrl: null }))).toBe(false);
    expect(showsInput(onAudio(started(), 'error'))).toBe(false);
    expect(submitAnswer(round(), answer).phase).toBe('ready');
  });

  it('une réponse envoyée ne peut pas être renvoyée deux fois', () => {
    const sent = submitAnswer(listened(started()), answer);
    expect(submitAnswer(sent, { artist: 'X', title: 'Y' })).toBe(sent);
  });
});

describe('passer un morceau injouable', () => {
  it('sans extrait : réponse vide au palier 0, sans confirmation', () => {
    const r = skipUnplayable(round({ previewUrl: null }));
    expect(r.phase).toBe('submitting');
    expect(r.submission).toEqual({ trackId: 7, listenedSeconds: 0, wasExtended: false, artist: null, title: null });
  });

  it('après un échec de lecture : garde le palier déjà annoncé au serveur (il refuserait moins)', () => {
    const failed = onAudio(listenMore(started()), 'error');
    expect(skipUnplayable(failed).submission).toMatchObject({ listenedSeconds: 1, wasExtended: true });
  });

  it('ne s\'applique pas à une manche jouable', () => {
    const r = playing(started());
    expect(skipUnplayable(r)).toBe(r);
  });
});

describe('envoi et révélation', () => {
  it('un échec d\'envoi garde la réponse et permet de réessayer', () => {
    const sent = submitAnswer(listened(started()), answer);
    const failed = submissionFailed(sent);
    expect(failed.phase).toBe('submit-error');
    expect(failed.submission).toEqual(sent.submission);
    expect(showsInput(failed)).toBe(true);
    const retried = retrySubmission(failed);
    expect(retried.phase).toBe('submitting');
    expect(retried.submission).toEqual(sent.submission);
  });

  it('le serveur répond : la réponse est révélée', () => {
    const r = reveal(submitAnswer(listened(started()), answer));
    expect(r.phase).toBe('revealed');
    expect(showsInput(r)).toBe(false);
  });

  it('ne se révèle pas sans envoi, ni deux fois', () => {
    const r = listened(started());
    expect(reveal(r)).toBe(r);
    const revealed = reveal(submitAnswer(r, answer));
    expect(reveal(revealed)).toBe(revealed);
  });

  it('réessayer sans échec ne fait rien', () => {
    const r = submitAnswer(listened(started()), answer);
    expect(retrySubmission(r)).toBe(r);
    expect(submissionFailed(listened(started())).phase).toBe('listened');
  });
});

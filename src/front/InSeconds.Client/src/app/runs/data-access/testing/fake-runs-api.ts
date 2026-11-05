import { Provider } from '@angular/core';
import { RunComparison, RunCurrentTrack, RunLink, RunPlay, RunRound, RunSession, RunTrack, RunsMe } from '../../domain/run';
import { LinkOutcome, RunAnswerToSend, RunsApi, StartOutcome } from '../runs.api';

export const ME = (overrides: Partial<RunsMe> = {}): RunsMe => ({ hasAccess: true, record: null, pending: null, shelf: [], ...overrides });

export const ROUND = (overrides: Partial<RunRound> = {}): RunRound => ({ round: 1, score: 0, objective: 200, maxScore: 500, ...overrides });

export const TRACK = (overrides: Partial<RunTrack> = {}): RunTrack => ({
  position: 1, round: 1, neutralized: false, artistCorrect: true, titleCorrect: true, points: 100,
  artist: 'Daft Punk', title: 'One More Time', coverUrl: 'https://cdn/cover.jpg', deezerTrackId: 3135553, waveform: null, ...overrides,
});

export const SESSION = (overrides: Partial<RunSession> = {}): RunSession => ({
  sessionId: 7, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 0, roundsPassed: 0,
  round: ROUND(), roundTracks: [], finish: null, answerSeconds: 45, clockRemainingSeconds: null, playedTracks: [], passedRounds: [],
  difficultyChoice: null, hand: [], offer: null, handSize: 0, nextDisc: null, cardValues: null, ...overrides,
});

export const CURRENT = (overrides: Partial<RunCurrentTrack> = {}): RunCurrentTrack => ({
  position: 1, round: 1, positionInRound: 1, previewUrl: 'https://cdn/preview-1.mp3', ...overrides,
});

export const PLAY = (overrides: Partial<RunPlay> = {}): RunPlay => ({
  session: SESSION(), revealed: null, neutralized: [], roundSummaries: [], current: CURRENT(), isResuming: false, ...overrides,
});

export const LINK = (overrides: Partial<RunLink> = {}): RunLink => ({
  code: 'ABC234', authorPseudo: 'Clément', trackCount: 20, rounds: 4, tracksPerRound: 5, listenSeconds: 10, answerSeconds: 45, myStatus: 'none', mySessionId: null, ...overrides,
});

export const COMPARISON = (overrides: Partial<RunComparison> = {}): RunComparison => ({
  code: 'ABC234',
  authorPseudo: 'Clément',
  playerCount: 2,
  roundCount: 4,
  rows: [
    { pseudo: 'Clément', disc: { key: 'runs.discs.gold', stars: 0 }, rounds: [500, 600, 700, 800], totalScore: 2600, isMe: false },
    { pseudo: null, disc: { key: 'runs.discs.wax', stars: 0 }, rounds: [480, 0, null, null], totalScore: 480, isMe: true },
  ],
  ...overrides,
});

/** Un faux adaptateur : chaque réponse se règle par une propriété, chaque appel est noté. */
export class FakeRunsApi implements Pick<RunsApi, 'me' | 'session' | 'challenge' | 'comparison' | 'launch' | 'join' | 'refreshPreview' | 'submitAnswer' | 'startClock' | 'abandon' | 'chooseDifficulty' | 'takeCard' | 'passOffer' | 'playCard'> {
  readonly calls: string[] = [];
  readonly answers: RunAnswerToSend[] = [];

  meResult: RunsMe | Error = ME();
  sessionResult: RunSession | Error = SESSION();
  challengeResult: LinkOutcome = { kind: 'ok', link: LINK() };
  comparisonResult: RunComparison | Error = COMPARISON();
  launchResult: StartOutcome = { kind: 'ok', play: PLAY() };
  joinResult: StartOutcome = { kind: 'ok', play: PLAY({ isResuming: true }) };
  refreshResult: RunPlay | Error = PLAY();
  answerResult: RunPlay | Error = PLAY();
  chooseResult: RunPlay | Error = PLAY();
  takeResult: RunSession | Error = SESSION();
  passResult: RunSession | Error = SESSION();
  playResult: RunPlay | Error = PLAY();
  abandonError: Error | null = null;

  me(): Promise<RunsMe> {
    this.calls.push('me');
    return this.meResult instanceof Error ? Promise.reject(this.meResult) : Promise.resolve(this.meResult);
  }

  session(sessionId: number): Promise<RunSession> {
    this.calls.push(`session:${sessionId}`);
    return this.sessionResult instanceof Error ? Promise.reject(this.sessionResult) : Promise.resolve(this.sessionResult);
  }

  challenge(code: string): Promise<LinkOutcome> {
    this.calls.push(`challenge:${code}`);
    return Promise.resolve(this.challengeResult);
  }

  comparison(code: string): Promise<RunComparison> {
    this.calls.push(`comparison:${code}`);
    return this.comparisonResult instanceof Error ? Promise.reject(this.comparisonResult) : Promise.resolve(this.comparisonResult);
  }

  launch(): Promise<StartOutcome> {
    this.calls.push('launch');
    return Promise.resolve(this.launchResult);
  }

  join(code: string): Promise<StartOutcome> {
    this.calls.push(`join:${code}`);
    return Promise.resolve(this.joinResult);
  }

  refreshPreview(sessionId: number): Promise<RunPlay> {
    this.calls.push(`refreshPreview:${sessionId}`);
    return this.refreshResult instanceof Error ? Promise.reject(this.refreshResult) : Promise.resolve(this.refreshResult);
  }

  submitAnswer(sessionId: number, answer: RunAnswerToSend): Promise<RunPlay> {
    this.calls.push(`submitAnswer:${sessionId}`);
    this.answers.push(answer);
    return this.answerResult instanceof Error ? Promise.reject(this.answerResult) : Promise.resolve(this.answerResult);
  }

  /** Ce que le serveur dit rester au chrono à l'annonce du premier son ; `null` : rien à recaler. */
  clockResult: number | null = null;

  chooseDifficulty(sessionId: number, round: number, difficulty: string): Promise<RunPlay> {
    this.calls.push(`chooseDifficulty:${sessionId}:${round}:${difficulty}`);
    return this.chooseResult instanceof Error ? Promise.reject(this.chooseResult) : Promise.resolve(this.chooseResult);
  }

  takeCard(sessionId: number, afterRound: number, card: string, dropSlot: number | null): Promise<RunSession> {
    this.calls.push(`takeCard:${sessionId}:${afterRound}:${card}:${dropSlot ?? ''}`);
    return this.takeResult instanceof Error ? Promise.reject(this.takeResult) : Promise.resolve(this.takeResult);
  }

  playCard(sessionId: number, slot: number, position: number): Promise<RunPlay> {
    this.calls.push(`playCard:${sessionId}:${slot}:${position}`);
    return this.playResult instanceof Error ? Promise.reject(this.playResult) : Promise.resolve(this.playResult);
  }

  passOffer(sessionId: number, afterRound: number): Promise<RunSession> {
    this.calls.push(`passOffer:${sessionId}:${afterRound}`);
    return this.passResult instanceof Error ? Promise.reject(this.passResult) : Promise.resolve(this.passResult);
  }

  startClock(sessionId: number, position: number): Promise<number | null> {
    this.calls.push(`startClock:${sessionId}:${position}`);
    return Promise.resolve(this.clockResult);
  }

  abandon(sessionId: number): Promise<void> {
    this.calls.push(`abandon:${sessionId}`);
    return this.abandonError ? Promise.reject(this.abandonError) : Promise.resolve();
  }
}

export const provideFakeRunsApi = (api: FakeRunsApi): Provider => ({ provide: RunsApi, useValue: api });

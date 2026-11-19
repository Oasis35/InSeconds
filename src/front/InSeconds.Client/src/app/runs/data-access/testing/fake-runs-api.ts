import { RunHit } from '../../domain/run-hits';
import { RunHistory } from '../../domain/run-history';
import { Provider } from '@angular/core';
import { RunComparison, RunCurrentTrack, RunLink, RunPlay, RunRound, RunSession, RunTrack, RunsMe } from '../../domain/run';
import { LinkOutcome, RunAnswerToSend, RunsApi, StartOutcome } from '../runs.api';

export const ME = (overrides: Partial<RunsMe> = {}): RunsMe => ({ hasAccess: true, record: null, pending: null, level: null, received: null, ...overrides });

export const ROUND = (overrides: Partial<RunRound> = {}): RunRound => ({ round: 1, score: 0, listenSeconds: 10, fullPoints: 100, failed: 0, ...overrides });

export const TRACK = (overrides: Partial<RunTrack> = {}): RunTrack => ({
  position: 1, round: 1, neutralized: false, artistCorrect: true, titleCorrect: true, points: 100,
  artist: 'Daft Punk', title: 'One More Time', coverUrl: 'https://cdn/cover.jpg', deezerTrackId: 3135553, waveform: null, ...overrides,
});

export const SESSION = (overrides: Partial<RunSession> = {}): RunSession => ({
  sessionId: 7, challengeCode: 'ABC234', status: 'pending', tracksPerRound: 5, lives: 3, livesLeft: 3, maxRounds: 0, totalScore: 0, roundsPassed: 0,
  round: ROUND(), roundTracks: [], finish: null, answerSeconds: 45, clockRemainingSeconds: null, playedTracks: [], passedRounds: [],
  themeChoice: null, ghost: null, themes: [], listenLadder: [10, 5, 3, 2, 1, 0.5], ...overrides,
});

export const CURRENT = (overrides: Partial<RunCurrentTrack> = {}): RunCurrentTrack => ({
  position: 1, round: 1, positionInRound: 1, previewUrl: 'https://cdn/preview-1.mp3', listenSeconds: 10, ...overrides,
});

export const PLAY = (overrides: Partial<RunPlay> = {}): RunPlay => ({
  session: SESSION(), revealed: null, neutralized: [], roundSummaries: [], current: CURRENT(), isResuming: false, ...overrides,
});

export const LINK = (overrides: Partial<RunLink> = {}): RunLink => ({
  code: 'ABC234', authorPseudo: 'Clément', lives: 3, tracksPerRound: 5, listenSeconds: 10, answerSeconds: 45, myStatus: 'none', mySessionId: null, themes: [], maxRounds: 8, ...overrides,
});

export const COMPARISON = (overrides: Partial<RunComparison> = {}): RunComparison => ({
  code: 'ABC234',
  authorPseudo: 'Clément',
  playerCount: 2,
  roundCount: 4,
  rows: [
    { pseudo: 'Clément', roundsPassed: 4, rounds: [500, 600, 700, 800], totalScore: 2600, isMe: false, tag: null },
    { pseudo: null, roundsPassed: 1, rounds: [480, 0, null, null], totalScore: 480, isMe: true, tag: null },
  ],
  ...overrides,
});

/** Un faux adaptateur : chaque réponse se règle par une propriété, chaque appel est noté. */
export class FakeRunsApi implements Pick<RunsApi, 'me' | 'session' | 'challenge' | 'comparison' | 'launch' | 'chooseTheme' | 'join' | 'refreshPreview' | 'submitAnswer' | 'startClock' | 'abandon' | 'hits' | 'history'> {
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
  abandonError: Error | null = null;
  hitsResult: RunHit[] | Error = [];
  historyResult: RunHistory | Error = { month: '2026-11', previousMonth: null, nextMonth: null, playedCount: 0, averageScore: null, bestScore: null, runs: [] };

  history(month: string | null): Promise<RunHistory> {
    this.calls.push(`history:${month ?? 'current'}`);
    return this.historyResult instanceof Error ? Promise.reject(this.historyResult) : Promise.resolve(this.historyResult);
  }

  hits(): Promise<RunHit[]> {
    this.calls.push('hits');
    return this.hitsResult instanceof Error ? Promise.reject(this.hitsResult) : Promise.resolve(this.hitsResult);
  }

  receiveError: Error | null = null;

  receive(code: string): Promise<void> {
    this.calls.push(`receive:${code}`);
    return this.receiveError ? Promise.reject(this.receiveError) : Promise.resolve();
  }

  dismissReceived(code: string): Promise<void> {
    this.calls.push(`dismissReceived:${code}`);
    return Promise.resolve();
  }

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

  chooseThemeResult: RunPlay | Error = PLAY();

  chooseTheme(sessionId: number, round: number, themeId: number | null): Promise<RunPlay> {
    this.calls.push(`chooseTheme:${sessionId}:${round}:${themeId ?? 'mystery'}`);
    return this.chooseThemeResult instanceof Error ? Promise.reject(this.chooseThemeResult) : Promise.resolve(this.chooseThemeResult);
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

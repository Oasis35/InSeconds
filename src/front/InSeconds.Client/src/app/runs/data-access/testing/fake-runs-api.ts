import { Provider } from '@angular/core';
import { RunCurrentTrack, RunPlay, RunRound, RunSession, RunTrack, RunsMe } from '../../domain/run';
import { RunAnswerToSend, RunsApi, StartOutcome } from '../runs.api';

export const ME = (overrides: Partial<RunsMe> = {}): RunsMe => ({ hasAccess: true, record: null, pending: null, ...overrides });

export const ROUND = (overrides: Partial<RunRound> = {}): RunRound => ({ round: 1, score: 0, objective: 200, maxScore: 500, ...overrides });

export const TRACK = (overrides: Partial<RunTrack> = {}): RunTrack => ({
  position: 1, round: 1, neutralized: false, artistCorrect: true, titleCorrect: true, points: 100,
  artist: 'Daft Punk', title: 'One More Time', coverUrl: 'https://cdn/cover.jpg', deezerTrackId: 3135553, ...overrides,
});

export const SESSION = (overrides: Partial<RunSession> = {}): RunSession => ({
  sessionId: 7, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 0, roundsPassed: 0,
  round: ROUND(), roundTracks: [], finish: null, ...overrides,
});

export const CURRENT = (overrides: Partial<RunCurrentTrack> = {}): RunCurrentTrack => ({
  position: 1, round: 1, positionInRound: 1, previewUrl: 'https://cdn/preview-1.mp3', ...overrides,
});

export const PLAY = (overrides: Partial<RunPlay> = {}): RunPlay => ({
  session: SESSION(), revealed: null, neutralized: [], roundSummaries: [], current: CURRENT(), isResuming: false, ...overrides,
});

/** Un faux adaptateur : chaque réponse se règle par une propriété, chaque appel est noté. */
export class FakeRunsApi implements Pick<RunsApi, 'me' | 'launch' | 'join' | 'refreshPreview' | 'submitAnswer' | 'abandon'> {
  readonly calls: string[] = [];
  readonly answers: RunAnswerToSend[] = [];

  meResult: RunsMe | Error = ME();
  launchResult: StartOutcome = { kind: 'ok', play: PLAY() };
  joinResult: StartOutcome = { kind: 'ok', play: PLAY({ isResuming: true }) };
  refreshResult: RunPlay | Error = PLAY();
  answerResult: RunPlay | Error = PLAY();
  abandonError: Error | null = null;

  async me(): Promise<RunsMe> {
    this.calls.push('me');
    if (this.meResult instanceof Error) throw this.meResult;
    return this.meResult;
  }

  async launch(): Promise<StartOutcome> {
    this.calls.push('launch');
    return this.launchResult;
  }

  async join(code: string): Promise<StartOutcome> {
    this.calls.push(`join:${code}`);
    return this.joinResult;
  }

  async refreshPreview(sessionId: number): Promise<RunPlay> {
    this.calls.push(`refreshPreview:${sessionId}`);
    if (this.refreshResult instanceof Error) throw this.refreshResult;
    return this.refreshResult;
  }

  async submitAnswer(sessionId: number, answer: RunAnswerToSend): Promise<RunPlay> {
    this.calls.push(`submitAnswer:${sessionId}`);
    this.answers.push(answer);
    if (this.answerResult instanceof Error) throw this.answerResult;
    return this.answerResult;
  }

  async abandon(sessionId: number): Promise<void> {
    this.calls.push(`abandon:${sessionId}`);
    if (this.abandonError) throw this.abandonError;
  }
}

export const provideFakeRunsApi = (api: FakeRunsApi): Provider => ({ provide: RunsApi, useValue: api });

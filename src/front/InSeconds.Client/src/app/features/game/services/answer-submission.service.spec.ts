import { TestBed } from '@angular/core/testing';
import { AnswerSubmissionService } from './answer-submission.service';
import { SubmitAnswerResponse } from '../../../core/models/game.models';

const RESPONSE: SubmitAnswerResponse = {
  artistCorrect: true, titleCorrect: true, score: 40,
  correctArtist: 'A', correctTitle: 'T', listenedDurationSeconds: 5,
  averageSecondsWhenCorrect: undefined, failureRatePercent: 0,
  guessTimeDistribution: [], notFoundCount: 0,
  hintLevelUsed: 0, hintPenaltyPercentApplied: 0,
} as any;

describe('AnswerSubmissionService', () => {
  let service: AnswerSubmissionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AnswerSubmissionService] });
    service = TestBed.inject(AnswerSubmissionService);
    // L'animation de countUp() dépend de requestAnimationFrame ; on la court-circuite pour
    // des tests déterministes (même flag que les tests E2E, cf. core/count-up.ts).
    (window as any).__disableAnimations = true;
  });

  afterEach(() => {
    delete (window as any).__disableAnimations;
  });

  it('defaults to no result and nothing pending', () => {
    expect(service.result()).toBeNull();
    expect(service.pendingConfirm()).toBeNull();
    expect(service.isSubmitting()).toBe(false);
    expect(service.displayedScore()).toBe(0);
    expect(service.submitFailed()).toBe(false);
  });

  it('setResult stores the result, stops isSubmitting and animates the displayed score', () => {
    service.startSubmitting();

    service.setResult(RESPONSE);

    expect(service.isSubmitting()).toBe(false);
    expect(service.result()).toBe(RESPONSE);
    expect(service.displayedScore()).toBe(40);
    expect(service.submitFailed()).toBe(false);
  });

  it('setError marks the submission as failed and stops isSubmitting, without setting a result', () => {
    service.startSubmitting();

    service.setError();

    expect(service.isSubmitting()).toBe(false);
    expect(service.submitFailed()).toBe(true);
    expect(service.result()).toBeNull();
  });

  it('setResult after setError clears the failed state', () => {
    service.setError();

    service.setResult(RESPONSE);

    expect(service.submitFailed()).toBe(false);
    expect(service.result()).toBe(RESPONSE);
  });

  it('setPendingConfirm opens and closes the inline confirmation', () => {
    service.setPendingConfirm('empty');
    expect(service.pendingConfirm()).toBe('empty');

    service.setPendingConfirm(null);
    expect(service.pendingConfirm()).toBeNull();
  });

  it('startSubmitting marks the answer as being sent and clears a previous failure', () => {
    service.setError();

    service.startSubmitting();

    expect(service.isSubmitting()).toBe(true);
    expect(service.submitFailed()).toBe(false);
  });

  it('reset clears result/score/submitting/failed state and pending confirmation', () => {
    service.setError();
    service.setPendingConfirm('skip');

    service.reset();

    expect(service.result()).toBeNull();
    expect(service.displayedScore()).toBe(0);
    expect(service.isSubmitting()).toBe(false);
    expect(service.submitFailed()).toBe(false);
    expect(service.pendingConfirm()).toBeNull();
  });
});

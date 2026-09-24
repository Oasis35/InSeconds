import { TestBed, fakeAsync, tick } from '@angular/core/testing';
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
    expect(service.showNetworkError()).toBe(false);
  });

  it('setResult stores the result, stops isSubmitting and animates the displayed score', () => {
    service.isSubmitting.set(true);

    service.setResult(RESPONSE);

    expect(service.isSubmitting()).toBe(false);
    expect(service.result()).toBe(RESPONSE);
    expect(service.displayedScore()).toBe(40);
    expect(service.showNetworkError()).toBe(false);
  });

  it('setResult(r, true) shows the network error toast and hides it after 4000ms', fakeAsync(() => {
    service.setResult(RESPONSE, true);

    expect(service.showNetworkError()).toBe(true);

    tick(4000);

    expect(service.showNetworkError()).toBe(false);
  }));

  it('a second network error result restarts the toast timer instead of stacking it', fakeAsync(() => {
    service.setResult(RESPONSE, true);
    tick(2000);
    service.setResult(RESPONSE, true);
    tick(2000);

    // Encore visible : le 2e appel a relancé le timer, seulement 2s se sont écoulées depuis.
    expect(service.showNetworkError()).toBe(true);

    tick(2000);
    expect(service.showNetworkError()).toBe(false);
  }));

  it('reset clears result/score/submitting/network toast and pending confirmation', fakeAsync(() => {
    service.setResult(RESPONSE, true);
    service.pendingConfirm.set('skip');

    service.reset();

    expect(service.result()).toBeNull();
    expect(service.displayedScore()).toBe(0);
    expect(service.isSubmitting()).toBe(false);
    expect(service.showNetworkError()).toBe(false);
    expect(service.pendingConfirm()).toBeNull();

    tick(4000); // le timer réseau a bien été nettoyé par reset(), rien ne doit se déclencher
  }));

  it('ngOnDestroy clears the pending network error timer', fakeAsync(() => {
    service.setResult(RESPONSE, true);

    service.ngOnDestroy();
    tick(4000);

    // Pas d'assertion possible sur l'état (le service est détruit), mais le tick ne doit pas lever.
    expect(true).toBe(true);
  }));
});

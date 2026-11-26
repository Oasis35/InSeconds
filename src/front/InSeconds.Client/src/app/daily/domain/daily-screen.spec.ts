import { DailyScreen, PeekContext, isRecapScreen, refocusContext, screenAfterToday } from './daily-screen';

describe('screenAfterToday', () => {
  it("l'état du jour donne l'accueil, la reprise ou « pas de défi »", () => {
    expect(screenAfterToday('can_start')).toEqual({ screen: 'welcome', abandoned: null });
    expect(screenAfterToday('resumable')).toEqual({ screen: 'resume_prompt', abandoned: null });
    expect(screenAfterToday('no_challenge')).toEqual({ screen: 'no_challenge', abandoned: null });
  });

  it('une partie finie ou abandonnée mène à « déjà joué », avec ou sans abandon', () => {
    expect(screenAfterToday('already_played')).toEqual({ screen: 'already_played', abandoned: false });
    expect(screenAfterToday('abandoned')).toEqual({ screen: 'already_played', abandoned: true });
  });
});

describe('refocusContext', () => {
  it("relit l'état du jour seulement depuis l'accueil et la reprise", () => {
    const contexts: [DailyScreen, PeekContext | null][] = [
      ['welcome', 'refocus'], ['resume_prompt', 'refocus'],
      ['loading', null], ['done', null], ['already_played', null], ['error', null], ['no_challenge', null],
    ];
    for (const [screen, expected] of contexts) expect(refocusContext(screen), screen).toBe(expected);
  });
});

describe('isRecapScreen', () => {
  it('le récap et « déjà joué » sont les écrans de fin', () => {
    expect(isRecapScreen('done')).toBe(true);
    expect(isRecapScreen('already_played')).toBe(true);
    expect(isRecapScreen('welcome')).toBe(false);
  });
});

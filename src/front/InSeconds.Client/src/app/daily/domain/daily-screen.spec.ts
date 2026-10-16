import { TodayState } from './daily';
import { DailyScreen, PeekContext, isRecapScreen, refocusContext, screenAfterToday } from './daily-screen';

describe('screenAfterToday', () => {
  it('première lecture : accueil, reprise, pas de défi', () => {
    expect(screenAfterToday('loading', 'initial', 'can_start')).toEqual({ screen: 'welcome', abandoned: null });
    expect(screenAfterToday('loading', 'initial', 'resumable')).toEqual({ screen: 'resume_prompt', abandoned: null });
    expect(screenAfterToday('loading', 'initial', 'no_challenge')).toEqual({ screen: 'no_challenge', abandoned: null });
  });

  it('une partie finie ou abandonnée mène à « déjà joué », avec ou sans abandon', () => {
    for (const context of ['initial', 'refocus', 'playing'] as PeekContext[]) {
      expect(screenAfterToday('playing', context, 'already_played')).toEqual({ screen: 'already_played', abandoned: false });
      expect(screenAfterToday('playing', context, 'abandoned')).toEqual({ screen: 'already_played', abandoned: true });
    }
  });

  it("pendant une partie, jamais de retour à l'accueil ni à la reprise ni à « pas de défi »", () => {
    for (const state of ['can_start', 'resumable', 'no_challenge'] as TodayState[]) {
      expect(screenAfterToday('playing', 'playing', state)).toEqual({ screen: 'playing', abandoned: null });
    }
  });

  it("au retour de l'onglet sur l'accueil, l'état du jour peut le faire passer à la reprise", () => {
    expect(screenAfterToday('welcome', 'refocus', 'resumable').screen).toBe('resume_prompt');
  });
});

describe('refocusContext', () => {
  it("relit l'état du jour seulement depuis l'accueil, la reprise et la partie", () => {
    const contexts: [DailyScreen, PeekContext | null][] = [
      ['welcome', 'refocus'], ['resume_prompt', 'refocus'], ['playing', 'playing'],
      ['loading', null], ['done', null], ['already_played', null], ['error', null], ['no_challenge', null],
    ];
    for (const [screen, expected] of contexts) expect(refocusContext(screen), screen).toBe(expected);
  });
});

describe('isRecapScreen', () => {
  it('le récap et « déjà joué » sont les écrans de fin', () => {
    expect(isRecapScreen('done')).toBe(true);
    expect(isRecapScreen('already_played')).toBe(true);
    expect(isRecapScreen('playing')).toBe(false);
    expect(isRecapScreen('welcome')).toBe(false);
  });
});

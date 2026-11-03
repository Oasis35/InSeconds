import { TestBed } from '@angular/core/testing';
import { RunTick } from './run-tick';

describe('RunTick', () => {
  const create = (): RunTick => {
    TestBed.configureTestingModule({ providers: [RunTick] });
    return TestBed.inject(RunTick);
  };

  it('ne sonne pas tant qu\'un clic n\'a pas réveillé le son', () => {
    const tick = create();

    expect(() => tick.play()).not.toThrow();
  });

  it('réveillé dans un clic, un tic ne casse rien', () => {
    const tick = create();

    tick.unlock();

    expect(() => tick.play()).not.toThrow();
  });

  it('ferme son contexte audio avec la page (Safari en limite le nombre)', () => {
    const tick = create();
    tick.unlock();
    const close = vi.spyOn(AudioContext.prototype, 'close');

    TestBed.resetTestingModule();

    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});

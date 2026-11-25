import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DailyLauncher } from './daily-launcher';
import { START_INTENT } from '../start-intent';

describe('DailyLauncher', () => {
  let navigate: ReturnType<typeof vi.fn>;
  let launcher: DailyLauncher;

  beforeEach(() => {
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({ providers: [DailyLauncher, { provide: Router, useValue: { navigate } }] });
    launcher = TestBed.inject(DailyLauncher);
  });

  it("navigue vers la manche avec l'intention de jouer, sans paramètre d'adresse, en gardant la query string", async () => {
    launcher.start();
    expect(launcher.starting()).toBe(true);
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledWith(['/daily'], { info: START_INTENT, queryParamsHandling: 'preserve', replaceUrl: true });
  });

  it('un second clic pendant l’ouverture ne navigue pas deux fois ; « starting » retombe à la fin, même si la navigation échoue', async () => {
    navigate.mockReturnValue(Promise.reject(new Error('chunk')));
    launcher.start();
    launcher.start();
    expect(navigate).toHaveBeenCalledTimes(1);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(launcher.starting()).toBe(false);
  });
});

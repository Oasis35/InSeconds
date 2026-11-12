import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunLevel } from '../../domain/run';
import { RunHomeCardComponent } from './run-home-card.component';

const LEVEL: RunLevel = {
  points: 1380, disc: { key: 'runs.discs.silver', stars: 3 }, nextDisc: { key: 'runs.discs.gold', stars: 4 },
  pointsToNext: 220, progressPercent: 44, provisional: false, runsPlayed: 12, delta: null,
};

describe('RunHomeCardComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunHomeCardComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, q: (id: string) => element.querySelector(`[data-testid="${id}"]`) };
  }

  describe('discrète (le défi du jour reste à jouer)', () => {
    it('sans partie finie : la promesse, « Jouer », le disque d’or', () => {
      const { element, q } = render();
      expect(q('run-home-card')?.getAttribute('data-size')).toBe('small');
      expect(q('run-home-line')?.textContent).toContain('runs.welcome.tagline');
      expect(q('run-home-play')?.textContent).toContain('runs.home.play');
      expect(q('run-home-play')?.getAttribute('href')).toBe('/setlist');
      expect(element.querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.gold');
    });

    it('avec un record : le record, au format de la langue, et le disque de son niveau', () => {
      const { element, q } = render({ record: 3420, level: LEVEL });
      expect(q('run-home-line')?.textContent).toContain('runs.home.record');
      expect(q('run-home-line')?.textContent).toMatch(/3\s420/);
      expect(q('run-home-line')?.textContent).toContain('runs.home.anytime');
      expect(element.querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.silver');
    });

    it('une setlist finie aujourd’hui : son score et « Rejouer »', () => {
      const { q } = render({ record: 3420, todayScore: 2980 });
      expect(q('run-home-line')?.textContent).toContain('runs.home.playedToday');
      expect(q('run-home-line')?.textContent).toMatch(/2\s980/);
      expect(q('run-home-play')?.textContent).toContain('runs.home.replay');
    });
  });

  describe('en grand (le défi du jour est joué)', () => {
    it('le niveau, la jauge et ce qui manque pour le disque suivant', () => {
      const { q } = render({ big: true, level: LEVEL });
      expect(q('run-home-card')?.getAttribute('data-size')).toBe('big');
      expect(q('run-home-level')?.textContent).toContain('runs.discs.silver');
      expect(q('run-home-level')?.textContent).toMatch(/1\s380/);
      expect((q('run-home-bar') as HTMLElement).style.width).toBe('44%');
      expect(q('run-home-play')?.textContent).toContain('runs.level.newSetlist');
      expect(q('run-home-next')).not.toBeNull();
      expect(q('run-home-play')?.getAttribute('href')).toBe('/setlist');
    });

    it('au plus haut disque : pas de disque suivant à annoncer', () => {
      const { q } = render({ big: true, level: { ...LEVEL, nextDisc: null, pointsToNext: null, progressPercent: 100 } });
      expect(q('run-home-next')).toBeNull();
    });

    it('sans niveau : la promesse, sans jauge', () => {
      const { q } = render({ big: true });
      expect(q('run-home-tagline')).not.toBeNull();
      expect(q('run-home-bar')).toBeNull();
    });
  });
});

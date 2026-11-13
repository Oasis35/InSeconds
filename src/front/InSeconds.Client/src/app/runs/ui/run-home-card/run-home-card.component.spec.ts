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
    it('sans partie finie : la promesse, « Jouer » en contour, le disque d’or, pas de rangée', () => {
      const { element, q } = render();
      expect(q('run-home-card')?.getAttribute('data-active')).toBe('false');
      expect(q('run-home-line')?.textContent).toContain('runs.welcome.tagline');
      expect(q('run-home-play')?.textContent).toContain('runs.home.play');
      expect(q('run-home-play')?.getAttribute('href')).toBe('/setlist');
      expect(element.querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.gold');
      expect(q('run-home-level')).toBeNull();
    });

    it('avec un record seul : le record, au format de la langue', () => {
      const { q } = render({ record: 3420 });
      expect(q('run-home-line')?.textContent).toContain('runs.home.record');
      expect(q('run-home-line')?.textContent).toMatch(/3\s420/);
      expect(q('run-home-line')?.textContent).toContain('runs.home.anytime');
    });

    it('avec un niveau : son disque, la rangée des huit disques où le sien est plus gros, la jauge et ses deux bornes', () => {
      const { element, q } = render({ record: 3420, level: LEVEL });
      expect(element.querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.silver');
      expect(q('run-home-line')?.textContent).toContain('runs.home.levelLabel');
      const ladder = [...(q('run-home-ladder')?.querySelectorAll('svg') ?? [])];
      expect(ladder).toHaveLength(8);
      expect(ladder.map(svg => svg.getAttribute('width'))).toEqual(['13', '13', '13', '22', '13', '13', '13', '13']);
      expect((q('run-home-bar') as HTMLElement).style.width).toBe('44%');
      expect(q('run-home-level')?.textContent).toMatch(/1\s380/);
      expect(q('run-home-next')?.textContent).toMatch(/1\s600/);
    });

    it('une setlist finie aujourd’hui : son score et « Rejouer »', () => {
      const { q } = render({ record: 3420, todayScore: 2980 });
      expect(q('run-home-line')?.textContent).toContain('runs.home.playedToday');
      expect(q('run-home-line')?.textContent).toMatch(/2\s980/);
      expect(q('run-home-play')?.textContent).toContain('runs.home.replay');
    });
  });

  describe('mise en avant (le défi du jour est joué)', () => {
    it('contour orange et « Jouer » en bouton principal, la carte reste compacte', () => {
      const { element, q } = render({ active: true, level: LEVEL });
      expect(q('run-home-card')?.getAttribute('data-active')).toBe('true');
      expect((q('run-home-card') as HTMLElement).style.border).toContain('var(--color-accent-3)');
      expect(q('run-home-play')?.textContent).toContain('runs.home.play');
      expect(element.querySelectorAll('[data-disc]')).toHaveLength(9);
    });

    it('au plus haut disque : pas de borne suivante', () => {
      const { q } = render({ active: true, level: { ...LEVEL, nextDisc: null, pointsToNext: null, progressPercent: 100 } });
      expect(q('run-home-next')).toBeNull();
    });
  });

  describe("le défi d'un ami", () => {
    const received = { code: 'ABC234', authorPseudo: 'Léa', scoreToBeat: 2140, expiresAt: '2026-11-19T00:00:00Z' };
    const now = new Date('2026-11-13T12:00:00Z');

    it('le bandeau lie à la playlist, annonce le score et les jours, et la croix émet le code', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
      const fixture = TestBed.createComponent(RunHomeCardComponent);
      fixture.componentRef.setInput('received', received);
      fixture.componentRef.setInput('now', now);
      const dismissed: string[] = [];
      fixture.componentInstance.dismissReceived.subscribe(code => dismissed.push(code));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('[data-testid="run-home-received-link"]')?.getAttribute('href')).toBe('/setlist/ABC234');
      expect(element.querySelector('[data-testid="run-home-received-score"]')?.textContent).toMatch(/runs\.home\.receivedScore/);
      expect(element.querySelector('[data-testid="run-home-received-days"]')?.textContent).toContain('runs.home.receivedExpires');
      (element.querySelector('[data-testid="run-home-received-dismiss"]') as HTMLButtonElement).click();
      expect(dismissed).toEqual(['ABC234']);
    });

    it('défi du jour joué : « Relever le défi » mène à la playlist ; sinon « Jouer » reste celui de la Setlist', () => {
      const inputs = (active: boolean) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
        const fixture = TestBed.createComponent(RunHomeCardComponent);
        fixture.componentRef.setInput('received', received);
        fixture.componentRef.setInput('active', active);
        fixture.detectChanges();
        return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="run-home-play"]');
      };

      const takeUp = inputs(true);
      expect(takeUp?.textContent).toContain('runs.home.takeUp');
      expect(takeUp?.getAttribute('href')).toBe('/setlist/ABC234');
      expect(inputs(false)?.getAttribute('href')).toBe('/setlist');
    });

    it('sans défi, pas de bandeau', () => {
      expect(render({}).q('run-home-received')).toBeNull();
    });
  });

  describe('sa place', () => {
    it('« 2e dans Potes · 14e au général » en français, « 2nd … » en anglais, sous la jauge', () => {
      const fr = render({ level: LEVEL, groupPlace: { name: 'Potes', rank: 2 }, generalRank: 14 });
      expect(fr.q('run-home-place')?.textContent).toContain('runs.home.placeGroup');
      expect(fr.q('run-home-place')?.textContent).toContain('·');
      expect(fr.q('run-home-place')?.textContent).toContain('runs.home.placeGeneral');
    });

    it('une moitié seule : sans séparateur', () => {
      const onlyGeneral = render({ level: LEVEL, generalRank: 14 });
      expect(onlyGeneral.q('run-home-place')?.textContent).not.toContain('·');
      expect(onlyGeneral.q('run-home-place')?.textContent).toContain('runs.home.placeGeneral');
    });

    it('rien à dire : pas de ligne', () => {
      expect(render({ level: LEVEL }).q('run-home-place')).toBeNull();
    });
  });
});

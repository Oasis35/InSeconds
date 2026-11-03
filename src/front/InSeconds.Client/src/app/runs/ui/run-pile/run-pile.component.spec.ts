import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { PileEntry, RunTrack } from '../../domain/run';
import { RunPileComponent } from './run-pile.component';

const track = (position: number, overrides: Partial<RunTrack> = {}): RunTrack => ({
  position, round: 1, neutralized: false, artistCorrect: true, titleCorrect: true, points: 100,
  artist: `Artiste ${position}`, title: `Titre ${position}`, coverUrl: `https://cdn/${position}.jpg`, deezerTrackId: position, waveform: null, ...overrides,
});

describe('RunPileComponent', () => {
  function render(entries: PileEntry[], total = 300) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunPileComponent);
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('shapes', { 2: [0.3, 0.9] });
    fixture.componentRef.setInput('total', total);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('le total du run, posé tel quel au premier affichage', () => {
    const { element } = render([]);

    expect(element.querySelector('[data-testid="run-total-score"]')?.textContent).toBe('300');
    expect(element.textContent).toContain('Total du run');
  });

  it('un morceau : pochette, forme, « Artiste - Titre » et ses points', () => {
    const { element } = render([{ kind: 'track', track: track(2), past: false }]);

    const row = element.querySelector<HTMLElement>('[data-testid="run-pile-track"]')!;
    expect(row.querySelector('img')?.getAttribute('src')).toBe('https://cdn/2.jpg');
    expect(row.querySelectorAll('app-run-wave i')).toHaveLength(2);
    expect(row.textContent).toContain('Artiste 2');
    expect(row.textContent).toContain('- Titre 2');
    expect(row.textContent).toContain('+100');
  });

  it('la ligne d\'une manche passée : le disque, son nom, la manche et son score sur son objectif ; ses morceaux grisés, sans titre', () => {
    const { element } = render([
      { kind: 'palier', passed: { round: 1, score: 400, objective: 200, disc: { key: 'runs.discs.wax', stars: 0 } } },
      { kind: 'track', track: track(1), past: true },
    ]);

    const line = element.querySelector<HTMLElement>('[data-testid="run-palier"]')!;
    expect(line.textContent).toContain('Disque de cire');
    expect(line.textContent).toContain('manche 1');
    expect(line.textContent).toContain('400 / 200');
    expect(line.querySelector('app-run-disc')).not.toBeNull();
    const row = element.querySelector<HTMLElement>('[data-testid="run-pile-track"]')!;
    expect(row.hasAttribute('data-past')).toBe(true);
    expect(row.querySelector('.pile-title')?.classList).toContain('gone');
  });

  it('un morceau retiré : ni pochette ni titre, « Morceau retiré », 0', () => {
    const { element } = render([{ kind: 'track', track: track(3, { neutralized: true, points: 0, artist: null, title: null, coverUrl: null }), past: false }]);

    const row = element.querySelector<HTMLElement>('[data-testid="run-pile-track"]')!;
    expect(row.querySelector('img')).toBeNull();
    expect(row.textContent).toContain('Morceau retiré');
    expect(row.textContent).toContain('0');
  });

  it('le total suit le score du run', async () => {
    const { fixture, element } = render([], 100);
    (window as { __disableAnimations?: boolean }).__disableAnimations = true;
    try {
      fixture.componentRef.setInput('total', 233);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(element.querySelector('[data-testid="run-total-score"]')?.textContent).toBe('233');
    } finally {
      delete (window as { __disableAnimations?: boolean }).__disableAnimations;
    }
  });
});

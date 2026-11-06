import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { PileEntry, RunGhostGap, RunTrack } from '../../domain/run';
import { RunPileComponent } from './run-pile.component';

const track = (position: number, overrides: Partial<RunTrack> = {}): RunTrack => ({
  position, round: 1, neutralized: false, artistCorrect: true, titleCorrect: true, points: 100,
  artist: `Artiste ${position}`, title: `Titre ${position}`, coverUrl: `https://cdn/${position}.jpg`, deezerTrackId: position, waveform: null, ...overrides,
});

describe('RunPileComponent', () => {
  function render(entries: PileEntry[], total = 300, ghost: RunGhostGap | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunPileComponent);
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('shapes', { 2: [0.3, 0.9] });
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('ghost', ghost);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('le total du run, posé tel quel au premier affichage', () => {
    const { element } = render([]);

    expect(element.querySelector('[data-testid="run-total-score"]')?.textContent).toBe('300');
    expect(element.textContent).toContain('Total du run');
  });

  it('le fantôme d\'un ami : son total au même morceau, en violet, et l\'avance ou le retard du joueur ; rien sans fantôme', () => {
    const line = (ghost: RunGhostGap) => {
      TestBed.resetTestingModule();
      return render([], 300, ghost).element.querySelector<HTMLElement>('[data-testid="run-ghost"]')!;
    };
    expect(render([]).element.querySelector('[data-testid="run-ghost"]')).toBeNull();

    const ahead = line({ pseudo: 'Alice', total: 1240, gap: 1060, stoppedAtRound: null });
    expect(ahead.textContent?.replace(/\s+/g, ' ').trim()).toBe('Alice 1 240 1 060 pts d’avance');
    expect((ahead.firstElementChild as HTMLElement).style.color).toBe('var(--color-violet)');
    // Un auteur invité (ou un compte effacé) porte le même nom qu'au lien reçu et dans la comparaison.
    expect(line({ pseudo: null, total: 340, gap: -40, stoppedAtRound: null }).textContent?.replace(/\s+/g, ' ').trim()).toBe('Invité 340 40 pts de retard');
    expect(line({ pseudo: 'Alice', total: 300, gap: 0, stoppedAtRound: null }).querySelector('[data-testid="run-ghost-gap"]')?.textContent?.trim()).toBe('À égalité');
    // Le joueur est allé plus loin que l'ami : où sa partie s'est arrêtée.
    expect(line({ pseudo: 'Alice', total: 300, gap: 900, stoppedAtRound: 2 }).querySelector('[data-testid="run-ghost-stopped"]')?.textContent?.trim())
      .toBe('arrêt en manche 2');
  });

  it('l\'écart change quand le total a fini de compter, pas avant', () => {
    vi.useFakeTimers();
    const { fixture, element } = render([], 300, { pseudo: 'Alice', total: 300, gap: 0, stoppedAtRound: null });
    const gap = () => element.querySelector('[data-testid="run-ghost-gap"]')?.textContent?.trim();
    expect(gap()).toBe('À égalité');

    fixture.componentRef.setInput('total', 400);
    fixture.componentRef.setInput('ghost', { pseudo: 'Alice', total: 300, gap: 100, stoppedAtRound: null });
    fixture.detectChanges();
    expect(gap()).toBe('À égalité');

    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(gap()).toBe('100 pts d’avance');
    vi.useRealTimers();
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

import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunTrack } from '../../domain/run';
import { RunRevealComponent } from './run-reveal.component';

const TRACK: RunTrack = {
  position: 3, round: 1, neutralized: false, artistCorrect: true, titleCorrect: false, points: 50,
  artist: 'Daft Punk', title: 'One More Time', coverUrl: 'https://cdn/cover.jpg', deezerTrackId: 3135553, waveform: null,
};

describe('RunRevealComponent', () => {
  function render(track: RunTrack = TRACK, endsRun = false) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunRevealComponent);
    fixture.componentRef.setInput('track', track);
    fixture.componentRef.setInput('peaks', [0.5, 0.8]);
    fixture.componentRef.setInput('endsRun', endsRun);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const text = (element: HTMLElement, id: string) => element.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

  it('la pochette, la forme, « Artiste - Titre », les deux verdicts et les points', () => {
    const { element } = render();

    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://cdn/cover.jpg');
    expect(element.querySelectorAll('app-run-wave i')).toHaveLength(2);
    expect(text(element, 'run-answer-artist')).toBe('Daft Punk');
    expect(text(element, 'run-answer-title')).toBe('One More Time');
    expect(text(element, 'run-answer-artist-verdict')).toBe('✓ Artiste');
    expect(text(element, 'run-answer-title-verdict')).toBe('✗ Titre');
    expect(text(element, 'run-answer-points')).toBe('+50');
    expect(element.querySelector('[data-testid="run-answer-deezer"]')).not.toBeNull();
  });

  it('un morceau sans point affiche 0, grisé', () => {
    const { element } = render({ ...TRACK, artistCorrect: false, points: 0 });

    const points = element.querySelector<HTMLElement>('[data-testid="run-answer-points"]')!;
    expect(points.textContent?.trim()).toBe('0');
    expect(points.style.color).toBe('var(--text-faint)');
  });

  it('le bouton mène au morceau suivant, ou annonce le résultat', () => {
    const { fixture, element } = render(TRACK, true);
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);

    const button = element.querySelector<HTMLButtonElement>('[data-testid="run-next-track"]')!;
    expect(button.textContent).toContain('Voir le résultat');
    button.click();

    expect(next).toHaveBeenCalledTimes(1);
  });
});

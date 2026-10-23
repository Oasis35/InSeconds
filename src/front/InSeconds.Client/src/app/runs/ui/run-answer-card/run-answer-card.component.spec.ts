import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TRACK } from '../../data-access/testing/fake-runs-api';
import { RunTrack } from '../../domain/run';
import { RunAnswerCardComponent } from './run-answer-card.component';

describe('RunAnswerCardComponent', () => {
  function render(track: RunTrack) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunAnswerCardComponent);
    fixture.componentRef.setInput('track', track);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const text = (element: HTMLElement, id: string) => element.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

  it("montre l'artiste, le titre, les points gagnés et le lien Deezer du morceau", () => {
    const { element } = render(TRACK({ points: 67, artist: 'Daft Punk', title: 'Harder, Better, Faster, Stronger' }));

    expect(text(element, 'run-answer-artist')).toBe('Daft Punk');
    expect(text(element, 'run-answer-title')).toBe('Harder, Better, Faster, Stronger');
    expect(text(element, 'run-answer-points')).toBe('+67');
    expect(element.querySelector('[data-testid="run-answer-deezer"]')?.getAttribute('href')).toBe('https://www.deezer.com/track/3135553');
  });

  it('✓ pour ce qui est trouvé, ✗ pour le reste', () => {
    const { element } = render(TRACK({ artistCorrect: true, titleCorrect: false }));

    expect(text(element, 'run-answer-artist-verdict')).toContain('✓');
    expect(text(element, 'run-answer-title-verdict')).toContain('✗');
  });

  it('sans identifiant Deezer, pas de lien', () => {
    const { element } = render(TRACK({ deezerTrackId: null }));

    expect(element.querySelector('[data-testid="run-answer-deezer"]')).toBeNull();
  });

  it('« Morceau suivant » est un bouton que la page branche sur le lancement du son', () => {
    const { fixture, element } = render(TRACK());
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);

    (element.querySelector('[data-testid="run-next-track"]') as HTMLButtonElement).click();

    expect(next).toHaveBeenCalledTimes(1);
  });
});

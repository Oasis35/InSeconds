import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ChallengeTrackStats } from '../../../domain/challenge';
import { ChallengeTrackStatsComponent } from './challenge-track-stats.component';

const track = (overrides: Partial<ChallengeTrackStats> = {}): ChallengeTrackStats => ({
  position: 2, artist: 'Daft Punk', title: 'One More Time', totalAnswers: 40, artistCorrectRate: 72.4, titleCorrectRate: 45.5,
  extendedRate: 18, avgListenedSeconds: 3.2, guessTimeDistribution: [], notFoundCount: 4, ...overrides,
});

describe('ChallengeTrackStatsComponent', () => {
  function render(value: ChallengeTrackStats) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ChallengeTrackStatsComponent);
    fixture.componentRef.setInput('track', value);
    const showChart = vi.fn();
    fixture.componentInstance.showChart.subscribe(showChart);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // Les quatre valeurs, dans l'ordre de la grille : artiste, titre, prolongation, écoute moyenne.
    const values = Array.from(element.querySelectorAll<HTMLElement>('.grid > div > span:last-child'));
    return { fixture, element, showChart, values, valueText: (i: number) => values[i].textContent!.replace(/\s+/g, ' ').trim(),
      bar: element.querySelector<HTMLElement>('.h-1.rounded-full.transition-all')! };
  }

  it('le rang, l\'artiste et le titre du morceau', () => {
    expect(render(track()).element.querySelector('p')!.textContent!.trim()).toBe('2. Daft Punk - One More Time');
  });

  it('les taux arrondis à l\'entier, avec leur pourcentage', () => {
    const { valueText } = render(track({ artistCorrectRate: 72.4, titleCorrectRate: 45.5, extendedRate: 18 }));

    expect(valueText(0)).toBe('72%');
    expect(valueText(1)).toBe('46%');
    expect(valueText(2)).toBe('18%');
  });

  it('l\'écoute moyenne en secondes, ou un trait quand personne n\'a écouté', () => {
    expect(render(track({ avgListenedSeconds: 3.2 })).valueText(3)).toBe('3.2s');
    expect(render(track({ avgListenedSeconds: null })).valueText(3)).toBe('-');
  });

  it.each([[75, 'var(--color-success)'], [60, 'var(--color-success)'], [45, 'var(--color-warn)'], [30, 'var(--color-warn)'], [10, 'var(--color-fail)']])(
    'un taux de %s%% pour l\'artiste est coloré %s, comme la barre du titre pour le même taux', (rate, color) => {
      const { values, bar } = render(track({ artistCorrectRate: rate, titleCorrectRate: rate }));

      expect(values[0].style.color).toBe(color);
      expect(values[1].style.color).toBe(color);
      expect(bar.style.background).toBe(color);
      expect(bar.style.width).toBe(`${rate}%`);
    });

  it('la prolongation et l\'écoute moyenne gardent la couleur neutre, quel que soit leur taux', () => {
    const { values } = render(track({ extendedRate: 5, avgListenedSeconds: 9 }));

    expect(values[2].style.color).toBe('var(--text-light)');
    expect(values[3].style.color).toBe('var(--text-light)');
  });

  it('l\'icône de la répartition des temps émet le morceau', () => {
    const value = track({ position: 4 });
    const { element, showChart } = render(value);

    element.querySelector<HTMLButtonElement>('button[aria-label="admin.challenges.showChart"]')!.click();

    expect(showChart).toHaveBeenCalledTimes(1);
    expect(showChart).toHaveBeenCalledWith(value);
  });
});

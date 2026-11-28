import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { GuessBucket } from '../../domain/round-result';
import { GuessTimeChartComponent } from './guess-time-chart.component';

const DISTRIBUTION: readonly GuessBucket[] = [
  { durationSeconds: 0.5, count: 4 },
  { durationSeconds: 1, count: 10 },
  { durationSeconds: 2, count: 0 },
];

describe('GuessTimeChartComponent', () => {
  function render(inputs: Partial<{
    distribution: readonly GuessBucket[]; notFoundCount: number; highlightDuration: number | null; highlightNotFound: boolean;
    showCounts: boolean; countSuffix: string;
  }> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(GuessTimeChartComponent);
    fixture.componentRef.setInput('distribution', inputs.distribution ?? DISTRIBUTION);
    for (const name of ['notFoundCount', 'highlightDuration', 'highlightNotFound', 'showCounts', 'countSuffix'] as const) {
      if (inputs[name] !== undefined) fixture.componentRef.setInput(name, inputs[name]);
    }
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const bars = () => Array.from(element.querySelectorAll<HTMLElement>('[data-bucket]'));
    const barOf = (key: string) => element.querySelector<HTMLElement>(`[data-bucket="${key}"]`)!;
    const fill = (key: string) => barOf(key).querySelector<HTMLElement>('.rounded-full')!;
    return { element, bars, barOf, fill, labels: () => Array.from(element.querySelectorAll('.mt-0\\.5 > span')).map(span => span.textContent!.trim()) };
  }

  it('une barre par palier, dans l\'ordre, puis la barre « non trouvé » tout à droite', () => {
    const { bars } = render();

    expect(bars().map(bar => bar.getAttribute('data-bucket'))).toEqual(['d0.5', 'd1', 'd2', 'nf']);
  });

  it('sans palier, il reste la barre « non trouvé »', () => {
    expect(render({ distribution: [], notFoundCount: 3 }).bars().map(bar => bar.getAttribute('data-bucket'))).toEqual(['nf']);
  });

  it('les étiquettes sont les paliers en secondes, puis une croix', () => {
    const labels = render().labels();

    expect(labels).toHaveLength(4);
    expect(labels[0]).toContain('0,5');
    expect(labels[1]).toContain('1');
    expect(labels[3]).toBe('✗');
  });

  describe('hauteurs', () => {
    it('relatives au plus grand compte : la plus haute barre prend la hauteur maximale', () => {
      const { fill } = render({ notFoundCount: 2 });

      expect(fill('d1').style.height).toBe('32px');
      expect(fill('d0.5').style.height).toBe('13px');
    });

    it('un palier sans personne est une simple ligne de 2 px, un petit compte garde 4 px au moins', () => {
      const { fill } = render({ distribution: [{ durationSeconds: 1, count: 1000 }, { durationSeconds: 2, count: 1 }, { durationSeconds: 3, count: 0 }] });

      expect(fill('d3').style.height).toBe('2px');
      expect(fill('d2').style.height).toBe('4px');
    });

    it('la barre « non trouvé » compte dans le maximum', () => {
      const { fill } = render({ distribution: [{ durationSeconds: 1, count: 5 }], notFoundCount: 20 });

      expect(fill('nf').style.height).toBe('32px');
      expect(fill('d1').style.height).toBe('8px');
    });

    it('sans aucun joueur, rien ne plante et toutes les barres sont des lignes', () => {
      const { bars, fill } = render({ distribution: [{ durationSeconds: 1, count: 0 }], notFoundCount: 0 });

      expect(bars()).toHaveLength(2);
      expect(fill('d1').style.height).toBe('2px');
      expect(fill('nf').style.height).toBe('2px');
    });
  });

  describe('surbrillance', () => {
    it('aucune barre surlignée par défaut', () => {
      expect(render().bars().filter(bar => bar.getAttribute('data-highlight') === 'true')).toHaveLength(0);
    });

    it('le palier du joueur est surligné, seul', () => {
      const { bars } = render({ highlightDuration: 1 });

      expect(bars().filter(bar => bar.getAttribute('data-highlight') === 'true').map(bar => bar.getAttribute('data-bucket'))).toEqual(['d1']);
    });

    it('un palier qui n\'existe pas dans la répartition ne surligne rien', () => {
      expect(render({ highlightDuration: 7 }).bars().filter(bar => bar.hasAttribute('data-highlight'))).toHaveLength(0);
    });

    it('le joueur qui n\'a pas trouvé surligne la barre « non trouvé »', () => {
      const { bars } = render({ highlightNotFound: true });

      expect(bars().filter(bar => bar.getAttribute('data-highlight') === 'true').map(bar => bar.getAttribute('data-bucket'))).toEqual(['nf']);
    });

    it('une barre surlignée change de couleur par rapport aux autres', () => {
      const { fill } = render({ highlightDuration: 1 });

      expect(fill('d1').style.background).not.toBe(fill('d0.5').style.background);
      expect(fill('d1').style.background).toBe('var(--color-accent-3)');
    });
  });

  describe('valeurs au-dessus des barres', () => {
    it('absentes par défaut', () => {
      expect(render().element.querySelectorAll('[data-testid="bar-count"]')).toHaveLength(0);
    });

    it('le nombre de joueurs sur chaque barre, « non trouvé » compris', () => {
      const { element } = render({ showCounts: true, notFoundCount: 6 });

      expect(Array.from(element.querySelectorAll('[data-testid="bar-count"]')).map(count => count.textContent!.trim())).toEqual(['4', '10', '0', '6']);
    });

    it('l\'unité se colle à chaque valeur (« % » sur la page d\'un jour passé)', () => {
      const { element } = render({ showCounts: true, countSuffix: '%' });

      expect(Array.from(element.querySelectorAll('[data-testid="bar-count"]')).map(count => count.textContent!.trim())).toEqual(['4%', '10%', '0%', '0%']);
    });

    it('le graphique est plus haut quand les valeurs sont écrites', () => {
      const without = render().element.querySelector<HTMLElement>('.items-end')!;
      const withCounts = render({ showCounts: true }).element.querySelector<HTMLElement>('.items-end')!;

      expect(without.style.height).toBe('36px');
      expect(withCounts.style.height).toBe('48px');
    });
  });
});

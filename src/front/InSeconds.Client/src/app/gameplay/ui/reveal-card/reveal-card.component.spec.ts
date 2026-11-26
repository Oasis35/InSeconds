import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RoundResult } from '../../domain/round-result';
import { GuessTimeChartComponent } from '../guess-time-chart/guess-time-chart.component';
import { RevealCardComponent } from './reveal-card.component';

const RESULT: RoundResult = {
  artistCorrect: true,
  titleCorrect: false,
  correctArtist: 'Daft Punk',
  correctTitle: 'Get Lucky',
  coverUrl: 'https://cdn.example/pochette.jpg',
  listenedSeconds: 1,
  distribution: [{ durationSeconds: 0.5, count: 3 }, { durationSeconds: 1, count: 8 }, { durationSeconds: 2, count: 1 }],
  notFoundCount: 4,
};

describe('RevealCardComponent', () => {
  @Component({
    imports: [RevealCardComponent],
    template: `
      <app-reveal-card [result]="result">
        <span roundScore>+850</span>
        <button roundNext>Suite</button>
      </app-reveal-card>`,
  })
  class Host {
    result = RESULT;
  }

  function render(result: RoundResult = RESULT) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.result = result;
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, text: () => element.textContent!.replace(/\s+/g, ' ') };
  }

  it('montre « Artiste - Titre » et la pochette', () => {
    const { element } = render();
    expect(element.querySelector('[data-testid="reveal-answer"]')?.getAttribute('title')).toBe('Daft Punk - Get Lucky');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/pochette.jpg');
  });

  it('sans pochette, pas d\'image', () => {
    expect(render({ ...RESULT, coverUrl: null }).element.querySelector('img')).toBeNull();
  });

  it('marque ✓ ce qui est trouvé et ✕ ce qui est raté, avec le mot pour les lecteurs d\'écran', () => {
    const { element } = render();
    const lines = Array.from(element.querySelectorAll<HTMLElement>('[data-testid="reveal-answer"] > span'));
    expect(lines[0].textContent).toContain('✓');
    expect(lines[0].querySelector('.sr-only')?.textContent).toContain('gameplay.reveal.found');
    expect(lines[1].textContent).toContain('✕');
    expect(lines[1].querySelector('.sr-only')?.textContent).toContain('gameplay.reveal.missed');
  });

  it('met le tout dans la tuile du lecteur, avec le graphique resserré, et le bouton « suite » dessous', () => {
    const { element } = render();
    const tile = element.querySelector('[data-testid="reveal-tile"]')!;
    expect(tile.querySelector('[roundScore]')).not.toBeNull();
    expect(tile.querySelector('[data-testid="guess-time-chart"]')).not.toBeNull();
    expect(tile.querySelector('[roundNext]')).toBeNull();
    expect(element.querySelector('[roundNext]')).not.toBeNull();
    const heights = Array.from(tile.querySelectorAll<HTMLElement>('[data-bucket] > div')).map(bar => Number.parseInt(bar.style.height));
    expect(Math.max(...heights)).toBeLessThanOrEqual(26);
  });

  it('place les éléments du mode : points, suite', () => {
    const { element } = render();
    expect(element.querySelector('[roundScore]')?.textContent).toBe('+850');
    expect(element.querySelector('[roundNext]')?.textContent).toBe('Suite');
  });

  it('surligne la colonne du palier quand le joueur a trouvé quelque chose', () => {
    const { element } = render();
    expect(element.querySelector('[data-highlight="true"]')?.getAttribute('data-bucket')).toBe('d1');
  });

  it('surligne la barre « ✗ » quand il n\'a rien trouvé', () => {
    const { element } = render({ ...RESULT, artistCorrect: false, titleCorrect: false });
    expect(element.querySelector('[data-highlight="true"]')?.getAttribute('data-bucket')).toBe('nf');
  });
});

describe('GuessTimeChartComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideTranslateService()] }));

  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(GuessTimeChartComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const buckets = [{ durationSeconds: 0.5, count: 2 }, { durationSeconds: 1, count: 6 }];

  it('une barre par palier plus la barre « ✗ »', () => {
    const element = render({ distribution: buckets, notFoundCount: 3 });
    expect(Array.from(element.querySelectorAll('[data-bucket]')).map(bar => bar.getAttribute('data-bucket'))).toEqual(['d0.5', 'd1', 'nf']);
    expect(element.textContent).toContain('0,5\u00a0s');
    expect(element.textContent).toContain('✗');
  });

  it('la plus haute barre fait 32 px, les autres sont proportionnelles, une barre vide reste visible', () => {
    const element = render({ distribution: [...buckets, { durationSeconds: 2, count: 0 }], notFoundCount: 3 });
    const heights = Array.from(element.querySelectorAll<HTMLElement>('[data-bucket] > div')).map(bar => bar.style.height);
    expect(heights).toEqual(['11px', '32px', '2px', '16px']);
  });

  it('en version resserrée (la révélation), la plus haute barre fait 26 px', () => {
    const element = render({ distribution: [...buckets, { durationSeconds: 2, count: 0 }], notFoundCount: 3, compact: true });
    const heights = Array.from(element.querySelectorAll<HTMLElement>('[data-bucket] > div')).map(bar => bar.style.height);
    expect(heights).toEqual(['9px', '26px', '2px', '13px']);
  });

  it('écrit les comptes au-dessus des barres quand on le demande', () => {
    expect(render({ distribution: buckets, showCounts: true }).textContent).toContain('6');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    expect(render({ distribution: buckets }).textContent).not.toContain('6');
  });

  it('ne surligne rien par défaut', () => {
    expect(render({ distribution: buckets }).querySelector('[data-highlight="true"]')).toBeNull();
  });
});

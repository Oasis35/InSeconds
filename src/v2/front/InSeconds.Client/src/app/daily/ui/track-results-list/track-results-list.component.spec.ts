import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TrackResultRow, TrackResultsListComponent } from './track-results-list.component';

const row = (over: Partial<TrackResultRow> = {}): TrackResultRow => ({
  position: 1,
  artist: 'Eminem',
  title: 'Lose Yourself',
  coverUrl: null,
  artistCorrect: true,
  titleCorrect: true,
  listenedSeconds: 1,
  averageSecondsWhenCorrect: 1.2,
  failureRatePercent: 10,
  score: 850,
  deezerTrackId: 42,
  distribution: [{ durationSeconds: 1, count: 3 }],
  notFoundCount: 1,
  ...over,
});

@Component({
  imports: [TrackResultsListComponent],
  template: `<app-track-results-list [rows]="rows" />`,
})
class Host {
  rows: TrackResultRow[] = [row()];
}

describe('TrackResultsListComponent', () => {
  function render(rows: TrackResultRow[]) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.rows = rows;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container > *').forEach(element => element.remove());
  });

  it('affiche artiste, titre, chips et score de chaque morceau', () => {
    const text = render([row()]).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Eminem — Lose Yourself');
    expect(text).toContain('✓');
    expect(text).toContain('+850');
    expect(text).toContain('1s');
  });

  it('masque chips et durée sans réponse du joueur', () => {
    const text = render([row({ artistCorrect: null, titleCorrect: null, listenedSeconds: null, score: null })]).textContent!;
    expect(text).not.toContain('✓');
    expect(text).not.toContain('✗');
    expect(text).not.toContain('+');
  });

  it('rend un score non cliquable quand le morceau n’a pas d’histogramme', () => {
    const element = render([row({ distribution: [] })]);
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).toContain('+850');
  });

  it('ouvre l’histogramme dans une fenêtre au clic sur le score', () => {
    const element = render([row()]);
    const button = element.querySelector<HTMLButtonElement>('button[aria-label]')!;
    expect(button.textContent).toContain('+850');
    button.click();
    TestBed.tick();
    const dialog = document.querySelector('.cdk-overlay-container');
    expect(dialog!.querySelector('[data-testid="guess-time-chart"]')).not.toBeNull();
    expect(dialog!.textContent).toContain('Eminem — Lose Yourself');
    // Le joueur a trouvé : sa colonne (1 s) est surlignée, pas la barre « ✗ ».
    expect(dialog!.querySelector('[data-bucket="d1"]')!.getAttribute('data-highlight')).toBe('true');
    expect(dialog!.querySelector('[data-bucket="nf"]')!.getAttribute('data-highlight')).toBeNull();
  });

  it('surligne la barre « ✗ » quand le joueur n’a pas trouvé', () => {
    const element = render([row({ artistCorrect: false, titleCorrect: false, score: 0 })]);
    element.querySelector<HTMLButtonElement>('button[aria-label]')!.click();
    TestBed.tick();
    expect(document.querySelector('[data-bucket="nf"]')!.getAttribute('data-highlight')).toBe('true');
  });
});

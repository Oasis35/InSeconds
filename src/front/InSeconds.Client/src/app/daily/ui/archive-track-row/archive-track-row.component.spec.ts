import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ARCHIVE_ME, ARCHIVE_TRACK } from '../../data-access/testing/fake-daily-api';
import { ArchiveTrack, ArchiveMyAnswer } from '../../domain/archive';
import { ArchiveTrackRowComponent } from './archive-track-row.component';

describe('ArchiveTrackRowComponent', () => {
  function render(track: ArchiveTrack, mine: ArchiveMyAnswer | null = null, mostMissed = false) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ArchiveTrackRowComponent);
    fixture.componentRef.setInput('track', track);
    fixture.componentRef.setInput('mine', mine);
    fixture.componentRef.setInput('mostMissed', mostMissed);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('montre le morceau et ce qu en ont fait les joueurs, en pourcentages seulement', () => {
    const element = render(ARCHIVE_TRACK(2, { artistFoundPercent: 74, titleFoundPercent: 69, notFoundPercent: 21 }), null, true);
    const players = element.querySelector('[data-testid=archive-players]')!.textContent!.replace(/\s+/g, ' ');

    expect(element.textContent).toContain('Artiste 2');
    expect(element.textContent).toContain('2002');
    expect(players).toContain('74 %');
    expect(players).toContain('69 %');
    const values = [...element.querySelectorAll('[data-testid=bar-count]')].map(e => e.textContent!.trim());
    expect(values.every(v => v.endsWith(' %'))).toBe(true);
    expect(values.at(-1)).toBe('21 %');
    expect(element.querySelector('[data-testid=most-missed]')).not.toBeNull();
    // Un visiteur : pas de « Toi », aucune barre en orange.
    expect(element.querySelector('[data-testid=archive-mine]')).toBeNull();
    expect(element.querySelector('[data-highlight]')).toBeNull();
  });

  it('un joueur reconnu voit ses ✓ / ✗, ses points, et sa barre en orange', () => {
    const element = render(ARCHIVE_TRACK(2), ARCHIVE_ME().answers[1]);
    const mine = element.querySelector('[data-testid=archive-mine]')!.textContent!;

    expect(mine).toContain('✓');
    expect(mine).toContain('✗');
    expect(element.querySelector('[data-testid=archive-mine-score]')!.textContent!.trim()).toBe('+850');
    expect(element.querySelector('[data-highlight]')!.getAttribute('data-bucket')).toBe('d1');
  });

  it("rien trouvé : c'est la barre ✗ qui est la sienne", () => {
    const element = render(ARCHIVE_TRACK(3), ARCHIVE_ME().answers[2]);
    expect(element.querySelector('[data-highlight]')!.getAttribute('data-bucket')).toBe('nf');
  });

  it('sous le seuil de joueurs : ni statistiques ni histogramme, mais « Toi » reste', () => {
    const bare = ARCHIVE_TRACK(1, { artistFoundPercent: null, titleFoundPercent: null, notFoundPercent: null, guessSteps: [] });
    expect(render(bare).querySelector('[data-testid=archive-players]')).toBeNull();
    TestBed.resetTestingModule();
    const element = render(bare, ARCHIVE_ME().answers[0]);
    expect(element.querySelector('[data-testid=guess-time-chart]')).toBeNull();
    expect(element.querySelector('[data-testid=archive-mine]')).not.toBeNull();
  });

  it('artiste et titre sur une ligne, en entier au toucher, de nouveau sur une ligne au suivant', () => {
    const element = render(ARCHIVE_TRACK(2));
    const text = element.querySelector<HTMLButtonElement>('[data-testid=archive-track-text]')!;
    const truncated = () => ['archive-artist', 'archive-title'].map(id => element.querySelector(`[data-testid=${id}]`)!.classList.contains('truncate'));

    // Le texte entier est toujours dans la page (moteurs de recherche), et dans l'info-bulle.
    expect(element.querySelector('[data-testid=archive-artist]')!.textContent!.trim()).toBe('Artiste 2');
    expect(text.title).toBe('Artiste 2 · Titre 2');
    expect(truncated()).toEqual([true, true]);
    expect(text.getAttribute('aria-expanded')).toBe('false');

    text.click();
    TestBed.inject(ApplicationRef).tick();
    expect(truncated()).toEqual([false, false]);
    expect(text.getAttribute('aria-expanded')).toBe('true');

    text.click();
    TestBed.inject(ApplicationRef).tick();
    expect(truncated()).toEqual([true, true]);
  });

  it("« Écouter l'extrait » demande la fenêtre d'écoute à la page", () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ArchiveTrackRowComponent);
    fixture.componentRef.setInput('track', ARCHIVE_TRACK(2));
    const listen = vi.fn();
    fixture.componentInstance.listen.subscribe(listen);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=archive-listen]')!.click();

    expect(listen).toHaveBeenCalledOnce();
  });
});

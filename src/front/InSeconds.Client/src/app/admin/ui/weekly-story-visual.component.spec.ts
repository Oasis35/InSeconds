import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StoryKind, WeeklyTrack } from '../domain/weekly-story';
import { WeeklyStoryVisualComponent } from './weekly-story-visual.component';

const track: WeeklyTrack = { artist: 'Daft Punk', title: 'One More Time', successRatePercent: 86.6, answers: 23 };

describe('WeeklyStoryVisualComponent', () => {
  function render(kind: StoryKind, inputs: Record<string, unknown> = {}): ComponentFixture<WeeklyStoryVisualComponent> {
    const fixture = TestBed.createComponent(WeeklyStoryVisualComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('track', track);
    fixture.componentRef.setInput('from', '2026-09-21');
    fixture.componentRef.setInput('to', '2026-09-27');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: ComponentFixture<unknown>) => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const count = (fixture: ComponentFixture<unknown>, selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector).length;

  it('story « le plus trouvé » : morceau, période, pourcentage arrondi, repère musique', () => {
    const fixture = render('found', { heading: 'Cette semaine' });

    expect((fixture.nativeElement as HTMLElement).dataset['story']).toBe('found');
    expect(text(fixture)).toContain('Daft Punk');
    expect(text(fixture)).toContain('One More Time');
    expect(text(fixture)).toContain('21 → 27 sept.');
    expect(text(fixture)).toContain('87 %');
    expect(text(fixture)).toContain('LE PLUS TROUVÉ');
    expect(text(fixture)).toContain('ont trouvé artiste + titre');
    expect(count(fixture, '.guide-music')).toBe(1);
    expect(count(fixture, '.guide-link')).toBe(1);
    expect(count(fixture, '.title')).toBe(1);
  });

  it('story « le plus raté » : pastille inversée, repère sondage', () => {
    const fixture = render('missed');

    expect((fixture.nativeElement as HTMLElement).dataset['story']).toBe('missed');
    expect(text(fixture)).toContain('LE PLUS RATÉ');
    expect(text(fixture)).toContain('seulement');
    expect(count(fixture, '.pill-reverse')).toBe(1);
    expect(count(fixture, '.guide-poll')).toBe(1);
  });

  it('sans repères, sans pourcentage, sans titre : ces éléments disparaissent', () => {
    const fixture = render('found', { showGuides: false, showPercent: false, heading: '' });

    expect(count(fixture, '.guide, .guide-link')).toBe(0);
    expect(count(fixture, '.rate, .caption')).toBe(0);
    expect(count(fixture, '.title')).toBe(0);
  });

  it('un titre long passe en police réduite', () => {
    const fixture = render('found', { heading: 'x'.repeat(40) });

    expect(count(fixture, '.title-long')).toBe(1);
  });

  it('n\'intègre aucune image : pas de pochette Deezer, une vignette note de musique', () => {
    const fixture = render('found');

    expect(count(fixture, 'img')).toBe(0);
    expect(count(fixture, '.cover svg')).toBe(1);
    expect(text(fixture)).not.toContain('inseconds.cc');
  });
});

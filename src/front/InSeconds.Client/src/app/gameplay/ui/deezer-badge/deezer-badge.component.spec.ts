import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DeezerBadgeComponent } from './deezer-badge.component';

describe('DeezerBadgeComponent', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DeezerBadgeComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ne rend rien sans identifiant Deezer', () => {
    expect(render({}).querySelector('a')).toBeNull();
  });

  it('lie vers le morceau Deezer dans un nouvel onglet', () => {
    const link = render({ deezerTrackId: 42 }).querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://www.deezer.com/track/42');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('choisit le visuel selon la langue', () => {
    const fr = render({ deezerTrackId: 1, lang: 'fr' }).querySelector('svg')!.innerHTML;
    TestBed.resetTestingModule();
    const en = render({ deezerTrackId: 1, lang: 'en' }).querySelector('svg')!.innerHTML;
    expect(fr).not.toBe(en);
  });

  it('reporte la largeur et la hauteur sur le SVG', () => {
    const svg = render({ deezerTrackId: 1, width: '84', height: '12' }).querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('84');
    expect(svg.getAttribute('height')).toBe('12');
  });
});

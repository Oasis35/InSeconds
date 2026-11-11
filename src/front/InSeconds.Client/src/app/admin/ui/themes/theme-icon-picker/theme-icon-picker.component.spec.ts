import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { THEME_ICONS } from '../../../../ui/theme-icon/theme-icon';
import { ThemeIconPickerComponent } from './theme-icon-picker.component';

describe('ThemeIconPickerComponent', () => {
  function render(current: string | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ThemeIconPickerComponent);
    fixture.componentRef.setInput('themeName', 'Années 80');
    fixture.componentRef.setInput('current', current);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const all = (id: string) => Array.from(el.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
    const type = (value: string) => {
      const input = q('theme-icon-search') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, el, q, all, type, cmp: fixture.componentInstance };
  }

  it('montre tout le stock au départ', () => {
    expect(render().all('theme-icon-option')).toHaveLength(THEME_ICONS.length);
  });

  it('cherche par mot français, sans accents', () => {
    const { all, type } = render();

    type('GUITARE');

    expect(all('theme-icon-option').map(b => b.getAttribute('aria-label'))).toContain('guitar');
    expect(all('theme-icon-option').length).toBeLessThan(THEME_ICONS.length);
  });

  it('une recherche sans résultat l\'écrit', () => {
    const { q, type } = render();

    type('zzzzzz');

    expect(q('theme-icon-empty')).not.toBeNull();
    expect(q('theme-icon-option')).toBeNull();
  });

  it('restreint à la catégorie touchée', () => {
    const { all, fixture } = render();

    all('theme-icon-category')[1].click();
    fixture.detectChanges();

    expect(all('theme-icon-option').length).toBeGreaterThan(0);
    expect(all('theme-icon-option').length).toBeLessThan(THEME_ICONS.length);
    expect(all('theme-icon-category')[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('surligne l\'icône actuelle, et « Choisir » ne s\'ouvre qu\'à un changement', () => {
    const { all, q, fixture } = render('music');

    expect(all('theme-icon-option').find(b => b.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label')).toBe('music');
    expect((q('theme-icon-save') as HTMLButtonElement).disabled).toBe(true);

    all('theme-icon-option').find(b => b.getAttribute('aria-label') === 'guitar')!.click();
    fixture.detectChanges();

    expect((q('theme-icon-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('« Choisir » envoie l\'icône touchée', () => {
    const { all, q, fixture, cmp } = render();
    const chosen: (string | null)[] = [];
    cmp.choose.subscribe(name => chosen.push(name));

    all('theme-icon-option').find(b => b.getAttribute('aria-label') === 'guitar')!.click();
    fixture.detectChanges();
    q('theme-icon-save')!.click();

    expect(chosen).toEqual(['guitar']);
  });

  it('« Sans icône » envoie null, « Fermer » ferme', () => {
    const { q, cmp } = render('music');
    const chosen: (string | null)[] = [];
    let closed = 0;
    cmp.choose.subscribe(name => chosen.push(name));
    cmp.closed.subscribe(() => closed++);

    q('theme-icon-clear')!.click();
    q('theme-icon-close')!.click();

    expect(chosen).toEqual([null]);
    expect(closed).toBe(1);
  });
});

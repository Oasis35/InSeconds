import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ThemeRow } from '../../../domain/themes';
import { ThemeListComponent } from './theme-list.component';

describe('ThemeListComponent', () => {
  const rows: ThemeRow[] = [
    { id: 1, name: 'Années 2000', icon: 'music', total: 32, playable: 30, health: 'varied' },
    { id: 2, name: 'Disney', icon: null, total: 9, playable: 8, health: 'thin' },
    { id: 3, name: 'Années 80', icon: null, total: 7, playable: 4, health: 'unplayable' },
  ];

  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ThemeListComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const names = () => Array.from(el.querySelectorAll('[data-testid="theme-card"]')).map(c => c.textContent);
    return { fixture, el, cmp: fixture.componentInstance, names };
  }

  it('montre une carte par thème, et l\'avertissement seulement sur celui qui n\'est pas jouable', () => {
    const { el } = render();

    expect(el.querySelectorAll('[data-testid="theme-card"]')).toHaveLength(3);
    expect(el.textContent).toContain('admin.themes.missing');
    expect(el.querySelectorAll('[data-testid="theme-card"]')[2].textContent).toContain('admin.themes.missing');
    expect(el.querySelectorAll('[data-testid="theme-card"]')[0].textContent).not.toContain('admin.themes.missing');
  });

  it('montre l\'icône des thèmes qui en ont une', () => {
    const el = render().el;

    const withIcon = Array.from(el.querySelectorAll('[data-testid="theme-card"]')).filter(card => card.querySelector('svg') !== null);
    expect(withIcon).toHaveLength(1);
    expect(withIcon[0].textContent).toContain('Années 2000');
  });

  it('cherche par nom pendant la frappe, accents ignorés', () => {
    const { el, fixture, names } = render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-search"]')!;

    input.value = 'annees 80';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Années 80');
  });

  it('filtre par état avec les puces, comptes affichés', () => {
    const { el, fixture, names } = render();
    const chips = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-chip"]'));

    expect(chips.map(c => c.textContent?.replaceAll(/\s+/g, ' ').trim())).toEqual([
      'admin.themes.chip.all · 3', 'admin.themes.chip.unplayable · 1', 'admin.themes.chip.thin · 1', 'admin.themes.chip.varied · 1',
    ]);
    chips[1].click();
    fixture.detectChanges();

    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain('Années 80');
  });

  it('ouvre un thème au clic et en crée un au formulaire', () => {
    const { el, fixture, cmp } = render();
    const selected: number[] = [];
    const added: string[] = [];
    cmp.select.subscribe(v => selected.push(v));
    cmp.add.subscribe(v => added.push(v));

    el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-card"]')[1].click();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-new"]')!;
    input.value = ' Jazz ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(selected).toEqual([2]);
    expect(added).toEqual(['Jazz']);
  });

  it('dit quand rien ne correspond', () => {
    const { el, fixture } = render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-search"]')!;

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="themes-empty"]')).not.toBeNull();
  });
});

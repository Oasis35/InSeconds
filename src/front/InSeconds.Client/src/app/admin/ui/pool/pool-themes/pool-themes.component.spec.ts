import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PoolThemesComponent } from './pool-themes.component';

describe('PoolThemesComponent', () => {
  function render(themes = [{ id: 1, name: 'Années 80', trackCount: 3 }, { id: 2, name: 'Films', trackCount: 0 }]) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(PoolThemesComponent);
    fixture.componentRef.setInput('themes', themes);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  it('compte les thèmes et liste chacun avec son nombre de morceaux', () => {
    const { el } = render();
    expect(el.querySelector('[data-testid="themes-count"]')?.textContent).toBe('2');
    expect(el.querySelectorAll('[data-testid="theme-row"]')).toHaveLength(2);
  });

  it("n'autorise la suppression que d'un thème sans morceau", () => {
    const { el } = render();
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-delete"]'));
    expect(buttons.map(b => b.disabled)).toEqual([true, false]);
  });

  it('renomme à la sortie du champ, supprime au clic, ajoute au formulaire', () => {
    const { el, cmp, fixture } = render();
    const renamed: unknown[] = [];
    const removed: number[] = [];
    const added: string[] = [];
    cmp.rename.subscribe(v => renamed.push(v));
    cmp.remove.subscribe(v => removed.push(v));
    cmp.add.subscribe(v => added.push(v));

    const first = el.querySelector<HTMLInputElement>('[data-testid="theme-row"] input')!;
    first.value = '  Eighties ';
    first.dispatchEvent(new Event('change'));
    el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-delete"]')[1].click();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-new"]')!;
    input.value = ' Jazz ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(renamed).toEqual([{ id: 1, name: 'Eighties' }]);
    expect(removed).toEqual([2]);
    expect(added).toEqual(['Jazz']);
  });
});

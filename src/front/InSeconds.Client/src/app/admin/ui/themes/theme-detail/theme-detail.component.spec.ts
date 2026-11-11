import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { poolTrack } from '../../../domain/testing/pool-track.fixture';
import { ThemeRow } from '../../../domain/themes';
import { ThemeDetailComponent } from './theme-detail.component';

describe('ThemeDetailComponent', () => {
  const tracks = [
    poolTrack({ id: 1, artist: 'a-ha', title: 'Take On Me' }),
    poolTrack({ id: 2, artist: 'Toto', title: 'Africa', preview: 'missing' }),
    poolTrack({ id: 3, artist: 'Soft Cell', title: 'Tainted Love', isDisabled: true }),
  ];

  function render(theme: ThemeRow = { id: 1, name: 'Années 80', icon: null, total: 3, playable: 1, health: 'unplayable' }) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ThemeDetailComponent);
    fixture.componentRef.setInput('theme', theme);
    fixture.componentRef.setInput('tracks', tracks);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  it('avertit qu\'il manque des morceaux jouables, et seulement alors', () => {
    expect(render().el.querySelector('[data-testid="theme-warning"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(render({ id: 1, name: 'Films', icon: null, total: 20, playable: 20, health: 'varied' }).el.querySelector('[data-testid="theme-warning"]')).toBeNull();
  });

  it('montre l\'icône du thème et ouvre le choix d\'icône', () => {
    const { el, cmp } = render({ id: 1, name: 'Années 80', icon: 'music', total: 3, playable: 1, health: 'unplayable' });
    let picked = 0;
    cmp.pickIcon.subscribe(() => picked++);

    expect(el.querySelector('h2 svg')).not.toBeNull();
    (el.querySelector('[data-testid="theme-icon-open"]') as HTMLElement).click();

    expect(picked).toBe(1);
  });

  it('liste les morceaux avec leur état (sans extrait, désactivé)', () => {
    const { el } = render();

    expect(el.querySelectorAll('[data-testid="theme-track"]')).toHaveLength(3);
    expect(el.textContent).toContain('admin.themes.noPreview');
    expect(el.textContent).toContain('admin.themes.disabled');
  });

  it('écoute, retire du thème et ouvre l\'ajout', () => {
    const { el, cmp } = render();
    const listened: number[] = [];
    const removed: number[] = [];
    let opened = 0;
    cmp.listen.subscribe(t => listened.push(t.id));
    cmp.removeTrack.subscribe(t => removed.push(t.id));
    cmp.addTracks.subscribe(() => opened++);

    el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-track"] button')[0].click();
    el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-track-remove"]')[1].click();
    el.querySelector<HTMLButtonElement>('[data-testid="theme-add-open"]')!.click();

    expect(listened).toEqual([1]);
    expect(removed).toEqual([2]);
    expect(opened).toBe(1);
  });

  it('cherche dans les morceaux du thème', () => {
    const { el, fixture } = render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-track-search"]')!;

    input.value = 'toto africa';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="theme-track"]')).toHaveLength(1);
  });

  it('ne laisse supprimer qu\'un thème sans morceau', () => {
    const { el } = render();
    expect(el.querySelector<HTMLButtonElement>('[data-testid="theme-delete"]')!.disabled).toBe(true);
    TestBed.resetTestingModule();
    const empty = render({ id: 2, name: 'Vide', icon: null, total: 0, playable: 0, health: 'unplayable' });
    expect(empty.el.querySelector<HTMLButtonElement>('[data-testid="theme-delete"]')!.disabled).toBe(false);
  });

  it('renomme à la sortie du champ', () => {
    const { el, fixture, cmp } = render();
    const renamed: string[] = [];
    cmp.rename.subscribe(v => renamed.push(v));

    el.querySelector<HTMLButtonElement>('[data-testid="theme-rename"]')!.click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-name-input"]')!;
    input.value = '  Eighties ';
    input.dispatchEvent(new Event('change'));

    expect(renamed).toEqual(['Eighties']);
  });

  it('n\'envoie pas un nom vide ou inchangé', () => {
    const { el, fixture, cmp } = render();
    const renamed: string[] = [];
    cmp.rename.subscribe(v => renamed.push(v));

    for (const value of ['   ', 'Années 80']) {
      el.querySelector<HTMLButtonElement>('[data-testid="theme-rename"]')!.click();
      fixture.detectChanges();
      const input = el.querySelector<HTMLInputElement>('[data-testid="theme-name-input"]')!;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    expect(renamed).toEqual([]);
  });
});

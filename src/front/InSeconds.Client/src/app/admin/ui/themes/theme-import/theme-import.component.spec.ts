import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PoolTheme, PoolTrack, ThemeAssignment } from '../../../domain/pool-track';
import { poolTrack } from '../../../domain/testing/pool-track.fixture';
import { ThemeImportComponent } from './theme-import.component';

describe('ThemeImportComponent', () => {
  const themes: PoolTheme[] = [{ id: 1, name: 'Années 80', trackCount: 1, icon: null }, { id: 2, name: 'Rock', trackCount: 0, icon: null }];
  const tracks = [
    poolTrack({ id: 10, artist: 'a-ha', title: 'Take On Me', themeIds: [1] }),
    poolTrack({ id: 11, artist: 'Toto', title: 'Africa' }),
    poolTrack({ id: 12, artist: 'AC/DC', title: 'Thunderstruck' }),
  ];

  function render(inputs: { added?: number | null } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ThemeImportComponent);
    fixture.componentRef.setInput('tracks', tracks);
    fixture.componentRef.setInput('themes', themes);
    if (inputs.added !== undefined) fixture.componentRef.setInput('added', inputs.added);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
    const type = (text: string) => {
      const area = q<HTMLTextAreaElement>('import-text')!;
      area.value = text;
      area.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, el, q, type, cmp: fixture.componentInstance };
  }

  it('n\'ouvre l\'aperçu qu\'avec un classement', () => {
    const { q, type, fixture } = render();

    expect(q<HTMLButtonElement>('import-preview')!.disabled).toBe(true);
    type('Rock ; 12');
    expect(q<HTMLButtonElement>('import-preview')!.disabled).toBe(false);
    q('import-preview')!.click();
    fixture.detectChanges();

    expect(q('import-summary')).not.toBeNull();
  });

  it('montre l\'aperçu par thème : à ajouter, déjà là, thème inconnu, morceau inconnu', () => {
    const { q, el, type, fixture } = render();
    type('Années 80 ; 10\nRock ; 11\nFilms ; 12\nRock ; 999');

    q('import-preview')!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="import-group"]')).toHaveLength(3);
    expect(el.querySelectorAll('[data-testid="import-track"]')).toHaveLength(2);
    expect(q('import-unknown-theme')).not.toBeNull();
    expect(q('import-problems')).not.toBeNull();
    expect(q<HTMLButtonElement>('import-apply')!.disabled).toBe(false);
  });

  it('applique seulement ce qui reste coché, thème par thème', () => {
    const { q, el, type, fixture, cmp } = render();
    const applied: (readonly ThemeAssignment[])[] = [];
    cmp.applied.subscribe(a => applied.push(a));
    type('Rock ; 11\nRock ; 12');
    q('import-preview')!.click();
    fixture.detectChanges();

    el.querySelectorAll<HTMLInputElement>('[data-testid="import-track"] input')[0].click();
    fixture.detectChanges();
    q('import-apply')!.click();

    expect(applied).toEqual([[{ themeId: 2, trackIds: [12] }]]);
  });

  it('n\'a rien à appliquer quand tout est déjà classé, et « Modifier » revient au texte', () => {
    const { q, type, fixture } = render();
    type('Années 80 ; 10');
    q('import-preview')!.click();
    fixture.detectChanges();

    expect(q<HTMLButtonElement>('import-apply')!.disabled).toBe(true);
    q('import-back')!.click();
    fixture.detectChanges();
    expect(q('import-text')).not.toBeNull();
  });

  it('écoute un morceau de l\'aperçu', () => {
    const { q, el, type, fixture, cmp } = render();
    const listened: PoolTrack[] = [];
    cmp.listen.subscribe(t => listened.push(t));
    type('Rock ; 12');
    q('import-preview')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-testid="import-track"] button')!.click();

    expect(listened.map(t => t.id)).toEqual([12]);
  });

  it('montre le résultat une fois appliqué, et propose d\'en importer un autre', () => {
    const { q, fixture, cmp } = render({ added: 7 });
    let reset = 0;
    cmp.reset.subscribe(() => reset++);

    expect(q('import-result')!.textContent).toContain('admin.themes.import.done');
    q('import-again')!.click();
    fixture.detectChanges();

    expect(reset).toBe(1);
  });
});

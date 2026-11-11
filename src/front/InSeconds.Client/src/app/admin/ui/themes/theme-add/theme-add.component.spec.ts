import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DeezerResult } from '../../../domain/pool-track';
import { poolTrack } from '../../../domain/testing/pool-track.fixture';
import { ThemeAddComponent } from './theme-add.component';

describe('ThemeAddComponent', () => {
  const pool = [
    poolTrack({ id: 1, deezerTrackId: 11, artist: 'Eminem', title: 'Lose Yourself', themeIds: [1] }),
    poolTrack({ id: 2, deezerTrackId: 12, artist: 'Toto', title: 'Africa', preview: 'missing' }),
    poolTrack({ id: 3, deezerTrackId: 13, artist: 'a-ha', title: 'Take On Me' }),
  ];
  const result: DeezerResult = { deezerTrackId: 99, artist: 'Cyndi Lauper', title: 'Time After Time', previewUrl: 'https://p/99.mp3' };

  function renderWith(tracks: ReturnType<typeof poolTrack>[]) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ThemeAddComponent);
    fixture.componentRef.setInput('poolTracks', tracks);
    fixture.componentRef.setInput('themeId', 1);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function render(inputs: Partial<{ deezerResults: DeezerResult[]; statuses: Record<number, 'loading' | 'success' | 'error'> }> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ThemeAddComponent);
    fixture.componentRef.setInput('poolTracks', pool);
    fixture.componentRef.setInput('themeId', 1);
    if (inputs.deezerResults) fixture.componentRef.setInput('deezerResults', inputs.deezerResults);
    if (inputs.statuses) fixture.componentRef.setInput('statuses', inputs.statuses);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  const candidates = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="theme-candidate"]'));

  it('propose les morceaux du pool qui ne sont pas déjà dans le thème, les jouables d\'abord', () => {
    const { el } = render();

    const rows = candidates(el);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Take On Me');
    expect(rows[1].textContent).toContain('Africa');
  });

  it('affiche tout le pool par tranches avec « Voir plus », et la recherche filtre tout le pool', () => {
    const many = Array.from({ length: 120 }, (_, i) => poolTrack({ id: i + 1, deezerTrackId: 1000 + i, artist: `Artiste ${i}`, title: `Titre ${i}` }));
    const { el, fixture } = renderWith(many);
    const more = () => el.querySelector<HTMLButtonElement>('[data-testid="theme-show-more"]');

    expect(candidates(el)).toHaveLength(50);
    more()!.click();
    fixture.detectChanges();
    expect(candidates(el)).toHaveLength(100);
    more()!.click();
    fixture.detectChanges();
    expect(candidates(el)).toHaveLength(120);
    expect(more()).toBeNull();

    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-pool-search"]')!;
    input.value = 'Titre 119';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(candidates(el)).toHaveLength(1);
  });

  it('coche plusieurs morceaux et les ajoute d\'un coup', () => {
    const { el, fixture, cmp } = render();
    const added: (readonly number[])[] = [];
    cmp.addPicked.subscribe(ids => added.push(ids));
    const submit = () => el.querySelector<HTMLButtonElement>('[data-testid="theme-add-submit"]')!;
    expect(submit().disabled).toBe(true);

    for (const box of Array.from(el.querySelectorAll<HTMLInputElement>('[data-testid="theme-candidate"] input'))) box.click();
    fixture.detectChanges();
    submit().click();

    expect(added).toEqual([[3, 2]]);
  });

  it('écoute un morceau du pool avec le ▶', () => {
    const { el, cmp } = render();
    const listened: number[] = [];
    cmp.listen.subscribe(t => listened.push(t.id));

    el.querySelector<HTMLButtonElement>('[data-testid="theme-candidate"] button')!.click();

    expect(listened).toEqual([3]);
  });

  it('cherche dans le pool', () => {
    const { el, fixture } = render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-pool-search"]')!;

    input.value = 'toto';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(candidates(el)).toHaveLength(1);
  });

  it('sur Deezer : cherche, écoute et ajoute un résultat au pool et au thème', () => {
    const { el, fixture, cmp } = render({ deezerResults: [result] });
    const queries: string[] = [];
    const previews: number[] = [];
    const added: number[] = [];
    cmp.deezerQueryChange.subscribe(q => queries.push(q));
    cmp.previewResult.subscribe(r => previews.push(r.deezerTrackId));
    cmp.addDeezer.subscribe(r => added.push(r.deezerTrackId));

    el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-add-source"]')[1].click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('[data-testid="theme-deezer-search"]')!;
    input.value = 'cyndi';
    input.dispatchEvent(new Event('input'));
    const buttons = el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-deezer-result"] button');
    buttons[0].click();
    buttons[1].click();

    expect(queries).toEqual(['cyndi']);
    expect(previews).toEqual([99]);
    expect(added).toEqual([99]);
  });

  it('sur Deezer : un résultat déjà dans le thème ne se rajoute pas', () => {
    const { el, fixture } = render({ deezerResults: [{ ...result, deezerTrackId: 11 }] });

    el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-add-source"]')[1].click();
    fixture.detectChanges();

    const buttons = el.querySelectorAll<HTMLButtonElement>('[data-testid="theme-deezer-result"] button');
    expect(buttons[1].disabled).toBe(true);
    expect(el.textContent).toContain('admin.themes.alreadyInTheme');
  });
});

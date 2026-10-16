import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PoolSort } from '../domain/pool-filters';
import { PoolTrack } from '../domain/pool-track';
import { PoolTableComponent } from './pool-table.component';

function track(overrides: Partial<PoolTrack> = {}): PoolTrack {
  return {
    id: 1, deezerTrackId: 1000, artist: 'Artiste', title: 'Titre', preview: 'available', isDisabled: false,
    lastUsedDate: null, usageCount: 0, unlockDate: null, inTodayChallenge: false, ...overrides,
  };
}

describe('PoolTableComponent', () => {
  function render(tracks: PoolTrack[], inputs: Partial<{
    selectedIds: number[]; togglingIds: number[]; sort: PoolSort | null; loading: boolean; totalCount: number;
    page: number; pages: number; filteredCount: number;
  }> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(PoolTableComponent);
    const set = (name: string, value: unknown) => fixture.componentRef.setInput(name, value);
    set('tracks', tracks);
    set('selectedIds', inputs.selectedIds ?? []);
    set('togglingIds', inputs.togglingIds ?? []);
    set('sort', inputs.sort ?? null);
    set('page', inputs.page ?? 0);
    set('pages', inputs.pages ?? 1);
    set('filteredCount', inputs.filteredCount ?? tracks.length);
    set('totalCount', inputs.totalCount ?? tracks.length);
    set('loading', inputs.loading ?? false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const row = (index = 0) => element.querySelectorAll('tbody tr')[index] as HTMLElement;
    const button = (r: HTMLElement, text: string) =>
      Array.from(r.querySelectorAll('button')).find(b => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
    return { fixture, component: fixture.componentInstance, element, row, button };
  }

  describe('actions d\'une ligne', () => {
    it('un morceau jamais utilisé se supprime, sans bouton de désactivation', () => {
      const { row, button } = render([track()]);

      expect(button(row(), '🗑')).toBeDefined();
      expect(button(row(), 'admin.pool.disable')).toBeUndefined();
      expect(row().textContent).toContain('admin.pool.available');
    });

    it('un morceau utilisé se désactive à la place de la suppression', () => {
      const { row, button } = render([track({ usageCount: 2 })]);

      expect(button(row(), '🗑')).toBeUndefined();
      expect(button(row(), 'admin.pool.disable')?.disabled).toBe(false);
      expect(row().textContent).toContain('admin.pool.used');
    });

    it('un morceau du défi du jour ne se désactive pas (bouton grisé)', () => {
      const { row, button } = render([track({ usageCount: 1, inTodayChallenge: true })]);

      expect(button(row(), 'admin.pool.disable')?.disabled).toBe(true);
    });

    it('un morceau désactivé se réactive, même dans le défi du jour', () => {
      const { row, button } = render([track({ usageCount: 1, isDisabled: true, inTodayChallenge: true })]);

      expect(button(row(), 'admin.pool.enable')?.disabled).toBe(false);
      expect(row().textContent).toContain('admin.pool.disabled');
      expect(row().querySelector('td.opacity-50')).not.toBeNull();
    });

    it('grise le bouton pendant que la désactivation est envoyée', () => {
      const { row, button } = render([track({ id: 5, usageCount: 1 })], { togglingIds: [5] });

      expect(button(row(), 'admin.pool.disable')?.disabled).toBe(true);
    });

    it('le renommage reste possible sur toutes les lignes, défi du jour compris', () => {
      const { row, button } = render([track({ usageCount: 1, inTodayChallenge: true })]);

      expect(button(row(), '✎')?.disabled).toBe(false);
    });

    it('émet le morceau pour chaque action', () => {
      const { component, row, button } = render([track({ id: 3 })]);
      const listen = vi.fn(), edit = vi.fn(), remove = vi.fn(), toggle = vi.fn();
      component.listen.subscribe(listen);
      component.edit.subscribe(edit);
      component.delete.subscribe(remove);
      component.toggleSelection.subscribe(toggle);

      button(row(), '▶')!.click();
      button(row(), '✎')!.click();
      button(row(), '🗑')!.click();
      (row().querySelector('input[type="checkbox"]') as HTMLInputElement).click();

      expect(listen).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
      expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
      expect(toggle).toHaveBeenCalledWith(3);
    });
  });

  describe('colonnes', () => {
    it('garde l\'ordre : sélection, actions, artiste, titre, extrait, statut, usage', () => {
      const { row } = render([track({ lastUsedDate: '2026-10-05', unlockDate: '2026-11-04', usageCount: 3 })]);

      const cells = Array.from(row().querySelectorAll('td')).map(td => td.textContent?.trim());
      expect(cells[2]).toBe('Artiste');
      expect(cells[3]).toBe('Titre');
      expect(cells[6]).toBe('2026-10-05');
      expect(cells[7]).toBe('2026-11-04');
      expect(cells[8]).toBe('3');
    });

    it('laisse vides les dates d\'un morceau jamais utilisé', () => {
      const { row } = render([track()]);

      const cells = Array.from(row().querySelectorAll('td')).map(td => td.textContent?.trim());
      expect(cells[6]).toBe('');
      expect(cells[7]).toBe('');
    });

    it('montre l\'état de l\'extrait, rien tant qu\'il n\'a pas été contrôlé', () => {
      const { row } = render([track({ preview: 'missing' }), track({ id: 2, preview: 'unknown' })]);

      expect(row(0).querySelectorAll('td')[4].textContent).toContain('admin.pool.previewMissing');
      expect(row(1).querySelectorAll('td')[4].textContent?.trim()).toBe('');
    });

    it('émet la colonne triée et indique le sens', () => {
      const { component, element } = render([track()], { sort: { column: 'usageCount', direction: 'desc' } });
      const sorted = vi.fn();
      component.sortBy.subscribe(sorted);

      const headers = Array.from(element.querySelectorAll('th'));
      expect(headers.find(th => th.getAttribute('aria-sort') === 'descending')?.textContent).toContain('admin.pool.colUsageCount');
      expect(headers.filter(th => th.getAttribute('aria-sort') === 'ascending')).toHaveLength(0);
      (headers.find(th => th.textContent?.includes('admin.pool.colArtist'))!.querySelector('button') as HTMLButtonElement).click();
      expect(sorted).toHaveBeenCalledWith('artist');
    });
  });

  describe('états et pagination', () => {
    it('annonce la vérification pendant le chargement', () => {
      const { element } = render([], { loading: true });

      expect(element.textContent).toContain('admin.pool.checkingPreviews');
      expect(element.querySelector('table')).toBeNull();
    });

    it('annonce un pool vide', () => {
      const { element } = render([], { totalCount: 0 });

      expect(element.textContent).toContain('admin.pool.empty');
    });

    it('compte les morceaux filtrés sur le total et propose les pages', () => {
      const { component, element } = render([track()], { filteredCount: 12, totalCount: 55, page: 1, pages: 4 });
      const previous = vi.fn(), next = vi.fn();
      component.previousPage.subscribe(previous);
      component.nextPage.subscribe(next);

      expect(element.textContent).toContain('12');
      expect(element.textContent).toContain('/ 55');
      const [back, forward] = Array.from(element.querySelectorAll<HTMLButtonElement>('tfoot, div button')).filter(b => ['←', '→'].includes(b.textContent!.trim()));
      back.click();
      forward.click();
      expect(previous).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('grise « précédent » sur la première page et « suivant » sur la dernière', () => {
      const first = render([track()], { page: 0, pages: 3 });
      const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter(b => ['←', '→'].includes(b.textContent!.trim()));
      expect(buttons(first.element).map(b => b.disabled)).toEqual([true, false]);
    });

    it('sans page en trop, n\'affiche pas de pagination', () => {
      const { element } = render([track()], { pages: 1 });

      expect(Array.from(element.querySelectorAll('button')).some(b => b.textContent!.trim() === '→')).toBe(false);
    });
  });
});

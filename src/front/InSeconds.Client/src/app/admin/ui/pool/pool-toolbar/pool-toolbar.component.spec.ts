import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CooldownTone } from '../../../domain/cooldown';
import { POOL_VIEW } from '../../../domain/pool-views';
import { PoolToolbarComponent } from './pool-toolbar.component';

type Inputs = Partial<{
  view: string; selectedCount: number; selectionHasUsedTrack: boolean; totalCount: number; availableCount: number; usedCount: number;
  disabledCount: number; missingPreviewCount: number; cooldownDays: number | null; cooldownTone: CooldownTone | null;
  addPanelOpen: boolean; rechecking: boolean; hardestFirst: boolean;
}>;

describe('PoolToolbarComponent', () => {
  function render(inputs: Inputs = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(PoolToolbarComponent);
    const set = (name: string, value: unknown) => fixture.componentRef.setInput(name, value);
    set('view', inputs.view ?? POOL_VIEW);
    set('selectedCount', inputs.selectedCount ?? 0);
    set('selectionHasUsedTrack', inputs.selectionHasUsedTrack ?? false);
    set('totalCount', inputs.totalCount ?? 120);
    set('availableCount', inputs.availableCount ?? 0);
    set('usedCount', inputs.usedCount ?? 0);
    set('disabledCount', inputs.disabledCount ?? 0);
    set('missingPreviewCount', inputs.missingPreviewCount ?? 0);
    set('cooldownDays', inputs.cooldownDays ?? null);
    set('cooldownTone', inputs.cooldownTone ?? null);
    set('addPanelOpen', inputs.addPanelOpen ?? false);
    if (inputs.rechecking !== undefined) set('rechecking', inputs.rechecking);
    if (inputs.hardestFirst !== undefined) set('hardestFirst', inputs.hardestFirst);
    const emitted = { deselectAll: vi.fn(), deleteSelection: vi.fn(), recheckSelection: vi.fn(), toggleAdd: vi.fn(), sortHardest: vi.fn() };
    const component = fixture.componentInstance;
    component.deselectAll.subscribe(emitted.deselectAll);
    component.deleteSelection.subscribe(emitted.deleteSelection);
    component.recheckSelection.subscribe(emitted.recheckSelection);
    component.toggleAdd.subscribe(emitted.toggleAdd);
    component.sortHardest.subscribe(emitted.sortHardest);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byTestId = (id: string) => element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    const buttonWith = (key: string) => Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(key));
    return { fixture, element, emitted, byTestId, buttonWith };
  }

  describe('vue générale', () => {
    it('sans sélection : le décompte du pool, sans désactivés ni extraits manquants quand il n\'y en a pas', () => {
      const { byTestId, element } = render({ totalCount: 120 });

      const counts = byTestId('pool-counts')!.textContent!;
      expect(counts).toContain('admin.pool.totalCount');
      expect(counts).not.toContain('admin.pool.disabledCount');
      expect(counts).not.toContain('admin.pool.missingPreviewCount');
      expect(element.textContent).not.toContain('admin.pool.selected');
    });

    it('ajoute les désactivés et les extraits manquants quand il y en a', () => {
      const counts = render({ disabledCount: 3, missingPreviewCount: 5 }).byTestId('pool-counts')!.textContent!;

      expect(counts).toContain('admin.pool.disabledCount');
      expect(counts).toContain('admin.pool.missingPreviewCount');
    });

    it('le décompte de la vue générale ne montre jamais le cooldown', () => {
      expect(render({ cooldownDays: 14, cooldownTone: 'high' }).byTestId('pool-cooldown')).toBeNull();
    });

    it('avec une sélection : leur nombre, désélectionner, revérifier et supprimer remplacent le décompte', () => {
      const { byTestId, buttonWith, element, emitted } = render({ selectedCount: 4 });

      expect(byTestId('pool-counts')).toBeNull();
      expect(element.textContent).toContain('admin.pool.selected');
      buttonWith('admin.pool.deselectAll')!.click();
      byTestId('recheck-selection')!.click();
      buttonWith('admin.pool.delete')!.click();
      expect(emitted.deselectAll).toHaveBeenCalledTimes(1);
      expect(emitted.recheckSelection).toHaveBeenCalledTimes(1);
      expect(emitted.deleteSelection).toHaveBeenCalledTimes(1);
    });

    it('la suppression est refusée quand la sélection contient un morceau déjà utilisé, et dit pourquoi', () => {
      const { buttonWith, emitted } = render({ selectedCount: 2, selectionHasUsedTrack: true });

      const remove = buttonWith('admin.pool.delete')!;
      expect(remove.disabled).toBe(true);
      expect(remove.parentElement!.getAttribute('title')).toBe('admin.pool.deleteUsedSelection');
      remove.click();
      expect(emitted.deleteSelection).not.toHaveBeenCalled();
    });

    it('sans morceau utilisé dans la sélection, la suppression est permise et sans infobulle', () => {
      const remove = render({ selectedCount: 2, selectionHasUsedTrack: false }).buttonWith('admin.pool.delete')!;

      expect(remove.disabled).toBe(false);
      expect(remove.parentElement!.getAttribute('title')).toBe('');
    });

    it('pendant un contrôle d\'extraits, « Revérifier » est grisé et change de libellé', () => {
      const idle = render({ selectedCount: 1, rechecking: false }).byTestId('recheck-selection')!;
      expect(idle.disabled).toBe(false);
      expect(idle.textContent).toContain('admin.pool.recheck');
      expect(idle.textContent).not.toContain('admin.pool.rechecking');

      TestBed.resetTestingModule();
      const busy = render({ selectedCount: 1, rechecking: true }).byTestId('recheck-selection')!;
      expect(busy.disabled).toBe(true);
      expect(busy.textContent).toContain('admin.pool.rechecking');
    });

    it('le bouton d\'ajout ouvre ou ferme le panneau, et dit lequel des deux', () => {
      const closed = render({ addPanelOpen: false });
      expect(closed.buttonWith('admin.pool.add')).toBeDefined();
      closed.buttonWith('admin.pool.add')!.click();
      expect(closed.emitted.toggleAdd).toHaveBeenCalledTimes(1);

      TestBed.resetTestingModule();
      const open = render({ addPanelOpen: true });
      expect(open.buttonWith('admin.pool.close')).toBeDefined();
      expect(open.buttonWith('admin.pool.add')).toBeUndefined();
    });

    it('le bouton d\'ajout reste proposé quand une sélection remplace le décompte', () => {
      expect(render({ selectedCount: 3 }).buttonWith('admin.pool.add')).toBeDefined();
    });
  });

  describe('vue d\'un mode', () => {
    it('disponibles et utilisés à la place du total, sans bouton d\'ajout ni suppression groupée', () => {
      const { byTestId, buttonWith } = render({ view: 'daily', availableCount: 90, usedCount: 30, selectedCount: 5 });

      const counts = byTestId('pool-counts')!.textContent!;
      expect(counts).toContain('admin.pool.availableUsed');
      expect(counts).not.toContain('admin.pool.totalCount');
      expect(buttonWith('admin.pool.add')).toBeUndefined();
      expect(buttonWith('admin.pool.delete')).toBeUndefined();
    });

    it('les extraits manquants ne se comptent que dans la vue générale', () => {
      expect(render({ view: 'runs', missingPreviewCount: 4 }).byTestId('pool-counts')!.textContent).not.toContain('admin.pool.missingPreviewCount');
    });

    it.each([['low', 'var(--color-fail)'], ['medium', 'var(--color-warn)'], ['high', 'var(--color-success)']] as const)(
      'le cooldown du jour est coloré selon son seuil (%s)', (tone, color) => {
        const cooldown = render({ view: 'daily', cooldownDays: 14, cooldownTone: tone }).byTestId('pool-cooldown')!;

        expect(cooldown.textContent).toContain('admin.pool.cooldown');
        expect(cooldown.style.color).toBe(color);
      });

    it('un cooldown non lu n\'affiche rien', () => {
      expect(render({ view: 'daily', cooldownDays: null }).byTestId('pool-cooldown')).toBeNull();
    });

    it('un cooldown de zéro jour s\'affiche (zéro n\'est pas « non lu »)', () => {
      expect(render({ view: 'daily', cooldownDays: 0, cooldownTone: 'low' }).byTestId('pool-cooldown')).not.toBeNull();
    });
  });

  describe('tri « Les moins trouvés »', () => {
    it('émet au clic, dans les deux vues', () => {
      const pool = render();
      pool.byTestId('sort-hardest')!.click();
      expect(pool.emitted.sortHardest).toHaveBeenCalledTimes(1);

      TestBed.resetTestingModule();
      const mode = render({ view: 'daily' });
      mode.byTestId('sort-hardest')!.click();
      expect(mode.emitted.sortHardest).toHaveBeenCalledTimes(1);
    });

    it('dit s\'il est en cours : état pressé et flèche', () => {
      const off = render({ hardestFirst: false }).byTestId('sort-hardest')!;
      expect(off.getAttribute('aria-pressed')).toBe('false');
      expect(off.textContent).not.toContain('▲');

      TestBed.resetTestingModule();
      const on = render({ hardestFirst: true }).byTestId('sort-hardest')!;
      expect(on.getAttribute('aria-pressed')).toBe('true');
      expect(on.textContent).toContain('▲');
    });

    it("est remplacé par la sélection : pas de tri pendant qu'on sélectionne", () => {
      expect(render({ selectedCount: 2 }).byTestId('sort-hardest')).toBeNull();
    });
  });
});

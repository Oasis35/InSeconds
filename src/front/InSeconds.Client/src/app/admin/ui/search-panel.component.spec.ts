import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DeezerResult } from '../domain/pool-track';
import { SearchPanelComponent } from './search-panel.component';

const result = (overrides: Partial<DeezerResult> = {}): DeezerResult =>
  ({ deezerTrackId: 42, artist: 'E2E Artist', title: 'E2E Track', previewUrl: 'https://preview/42.mp3', ...overrides });

describe('SearchPanelComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(SearchPanelComponent);
    const defaults: Record<string, unknown> = { query: '', results: [], existing: new Map<number, boolean>() };
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = () => Array.from(element.querySelectorAll('li button')) as HTMLButtonElement[];
    return { fixture, component: fixture.componentInstance, element, play: () => buttons()[0], add: () => buttons()[1] };
  }

  it('montre « artiste - titre » pour chaque résultat', () => {
    const { element } = render({ results: [result()] });

    expect(element.querySelector('li')?.textContent).toContain('E2E Artist - E2E Track');
  });

  it('émet la saisie, la liaison, l\'écoute et l\'ajout', () => {
    const { component, element, play, add } = render({ results: [result()] });
    const query = vi.fn(), link = vi.fn(), preview = vi.fn(), added = vi.fn();
    component.queryChange.subscribe(query);
    component.toggleLink.subscribe(link);
    component.preview.subscribe(preview);
    component.add.subscribe(added);

    const input = element.querySelector('input')!;
    input.value = 'Eminem';
    input.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('h3 + button')!.click();
    play().click();
    add().click();

    expect(query).toHaveBeenCalledWith('Eminem');
    expect(link).toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith(result());
    expect(added).toHaveBeenCalledWith(result());
  });

  it('distingue des recherches liées ou indépendantes', () => {
    expect(render({ linked: true }).element.textContent).toContain('admin.addPanel.linked');
    TestBed.resetTestingModule();
    expect(render({ linked: false }).element.textContent).toContain('admin.addPanel.unlinked');
  });

  describe('doublons', () => {
    it('avertit d\'un morceau déjà en pool et disponible, sans empêcher l\'ajout', () => {
      const { element, add } = render({ results: [result()], existing: new Map([[42, true]]) });

      expect(element.querySelector('li')?.textContent).toContain('admin.addPanel.alreadyInPool');
      expect(add().disabled).toBe(false);
    });

    it('avertit d\'un morceau déjà utilisé dans un défi passé', () => {
      const { element } = render({ results: [result()], existing: new Map([[42, false]]) });

      expect(element.querySelector('li')?.textContent).toContain('admin.addPanel.alreadyUsed');
    });

    it('n\'avertit pas d\'un morceau inconnu du pool', () => {
      const { element } = render({ results: [result()], existing: new Map([[7, true]]) });

      expect(element.querySelector('li')?.textContent).not.toContain('⚠');
    });
  });

  describe('ajout', () => {
    it.each([
      ['loading', '…', true],
      ['success', '✓', false],
      ['error', '!', false],
    ] as const)('ligne en état %s', (status, symbol, disabled) => {
      const { add } = render({ results: [result()], addStatuses: { 42: status } });

      expect(add().textContent?.trim()).toBe(symbol);
      expect(add().disabled).toBe(disabled);
    });

    it.each([
      ['success', 'admin.addPanel.added'],
      ['error', 'admin.addPanel.addError'],
    ] as const)('nomme le bouton d\'après son état %s (le symbole seul ne dit rien)', (status, label) => {
      const { add } = render({ results: [result()], addStatuses: { 42: status } });

      expect(add().getAttribute('aria-label')).toBe(label);
    });

    it('propose « + » par défaut, nommé « Ajouter »', () => {
      const { add } = render({ results: [result()] });

      expect(add().textContent?.trim()).toBe('+');
      expect(add().getAttribute('aria-label')).toBe('admin.addPanel.addTrack');
    });

    it('porte la raison d\'un échec sur le bouton, pour cette ligne seulement', () => {
      const { add } = render({
        results: [result()], addStatuses: { 42: 'error' }, addErrorKeys: { 42: 'errors.catalogue.duplicate_deezer_id' },
      });

      expect(add().title).toBe('errors.catalogue.duplicate_deezer_id');
    });
  });

  describe('écoute', () => {
    it('grise l\'écoute d\'un résultat sans extrait', () => {
      const { play } = render({ results: [result({ previewUrl: null })] });

      expect(play().disabled).toBe(true);
    });

    it('montre toujours ▶, sans barre : l\'écoute se fait dans sa fenêtre', () => {
      const { element, play } = render({ results: [result()] });

      expect(play().textContent?.trim()).toBe('▶');
      expect(play().getAttribute('aria-label')).toBe('admin.previewModal.title');
      expect(element.querySelector('[role="progressbar"]')).toBeNull();
    });
  });

  it('annonce la recherche en cours et l\'erreur de Deezer', () => {
    const { element } = render({ searching: true, errorKey: 'errors.catalogue.deezer_unavailable' });

    expect(element.textContent).toContain('admin.addPanel.searching');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.catalogue.deezer_unavailable');
  });
});

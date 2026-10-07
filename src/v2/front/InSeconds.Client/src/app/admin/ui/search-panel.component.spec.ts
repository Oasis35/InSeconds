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

  it('montre « artiste — titre » pour chaque résultat', () => {
    const { element } = render({ results: [result()] });

    expect(element.querySelector('li')?.textContent).toContain('E2E Artist — E2E Track');
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
      ['success', 'admin.addPanel.added', false],
      ['error', 'admin.addPanel.addError', false],
    ] as const)('ligne en état %s', (status, label, disabled) => {
      const { add } = render({ results: [result()], addStatuses: { 42: status } });

      expect(add().textContent?.trim()).toBe(label);
      expect(add().disabled).toBe(disabled);
    });

    it('propose « Ajouter » par défaut', () => {
      const { add } = render({ results: [result()] });

      expect(add().textContent?.trim()).toBe('admin.addPanel.addTrack');
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

    it('montre ⏸ et la barre seulement sur l\'extrait en cours de lecture', () => {
      const { element } = render({
        results: [result(), result({ deezerTrackId: 43, previewUrl: 'https://preview/43.mp3' })],
        previewingUrl: 'https://preview/42.mp3', playing: true, progress: 40,
      });

      const [first, second] = Array.from(element.querySelectorAll('li'));
      expect(first.querySelector('button')?.textContent?.trim()).toBe('⏸');
      expect(first.querySelector<HTMLElement>('[style*="width"]')?.style.width).toBe('40%');
      expect(second.querySelector('button')?.textContent?.trim()).toBe('▶');
      expect(second.querySelector('[style*="width"]')).toBeNull();
    });

    it('revient à ▶ quand l\'extrait est en pause', () => {
      const { play } = render({ results: [result()], previewingUrl: 'https://preview/42.mp3', playing: false });

      expect(play().textContent?.trim()).toBe('▶');
    });
  });

  it('annonce la recherche en cours et l\'erreur de Deezer', () => {
    const { element } = render({ searching: true, errorKey: 'errors.catalogue.deezer_unavailable' });

    expect(element.textContent).toContain('admin.addPanel.searching');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.catalogue.deezer_unavailable');
  });
});

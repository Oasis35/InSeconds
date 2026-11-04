import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { NO_FILTERS, PoolFilters } from '../../../domain/pool-filters';
import { PoolFilterBarComponent } from './pool-filter-bar.component';

describe('PoolFilterBarComponent', () => {
  function render(filters: PoolFilters = NO_FILTERS) {
    TestBed.configureTestingModule({ imports: [PoolFilterBarComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(PoolFilterBarComponent);
    fixture.componentRef.setInput('filters', filters);
    fixture.detectChanges();
    return fixture;
  }

  const fields = (fixture: ReturnType<typeof render>) => fixture.nativeElement.querySelector('#pool-filter-fields') as HTMLElement;
  const toggle = (fixture: ReturnType<typeof render>) =>
    fixture.nativeElement.querySelector('[data-testid="pool-filters-toggle"]') as HTMLButtonElement;

  it('sur téléphone, les filtres hors texte sont repliés, et se déplient au clic sur « Filtres »', () => {
    const fixture = render();
    expect(fields(fixture).className).toContain('hidden');
    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('false');

    toggle(fixture).click();
    fixture.detectChanges();

    expect(fields(fixture).className).not.toMatch(/(^| )hidden( |$)/);
    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('true');
  });

  it('le champ texte reste toujours visible, hors du bloc replié', () => {
    const fixture = render();
    expect(fields(fixture).querySelector('#pool-filter-text')).toBeNull();
    expect(fixture.nativeElement.querySelector('#pool-filter-text')).not.toBeNull();
  });

  it('le bouton compte les filtres actifs hors texte', () => {
    const fixture = render({ ...NO_FILTERS, text: 'queen', status: 'used', genre: 'Rock' });
    expect(toggle(fixture).textContent).toContain('admin.pool.filtersActive');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FreezeCellsComponent } from './freeze-cells.component';

describe('FreezeCellsComponent', () => {
  let fixture: ComponentFixture<FreezeCellsComponent>;

  function render(count: number, max: number, extra: { size?: 'sm' | 'md' | 'lg'; fillLast?: boolean } = {}): HTMLElement {
    fixture = TestBed.createComponent(FreezeCellsComponent);
    fixture.componentRef.setInput('count', count);
    fixture.componentRef.setInput('max', max);
    if (extra.size) fixture.componentRef.setInput('size', extra.size);
    if (extra.fillLast !== undefined) fixture.componentRef.setInput('fillLast', extra.fillLast);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FreezeCellsComponent] }).compileComponents();
  });

  it('affiche une case par gel possible, pleines puis vides', () => {
    const el = render(1, 2);
    expect(el.querySelectorAll('[data-testid="freeze-cell-full"]')).toHaveSize(1);
    expect(el.querySelectorAll('[data-testid="freeze-cell-empty"]')).toHaveSize(1);
  });

  it('plafonne les cases pleines au maximum', () => {
    const el = render(5, 2);
    expect(el.querySelectorAll('[data-testid="freeze-cell-full"]')).toHaveSize(2);
    expect(el.querySelectorAll('[data-testid="freeze-cell-empty"]')).toHaveSize(0);
  });

  it('aucune case pour un invité (max 0)', () => {
    const el = render(0, 0);
    expect(el.querySelectorAll('[data-testid^="freeze-cell"]')).toHaveSize(0);
  });

  it('fillLast anime uniquement la dernière case pleine', () => {
    const el = render(2, 2, { fillLast: true });
    const animated = el.querySelectorAll('[data-anim]');
    expect(animated).toHaveSize(1);
    const cells = el.querySelectorAll('[data-testid="freeze-cell-full"]');
    expect(cells[1].querySelector('[data-anim]')).not.toBeNull();
    expect(cells[0].querySelector('[data-anim]')).toBeNull();
  });

  it('sans fillLast, aucune animation', () => {
    const el = render(2, 2);
    expect(el.querySelectorAll('[data-anim]')).toHaveSize(0);
  });

  it('dimensionne les cases selon la taille', () => {
    const cellWidth = (size: 'sm' | 'md' | 'lg') =>
      (render(1, 1, { size }).querySelector('[data-testid="freeze-cell-full"]') as HTMLElement).style.width;
    expect(cellWidth('sm')).toBe('22px');
    expect(cellWidth('md')).toBe('28px');
    expect(cellWidth('lg')).toBe('40px');
  });
});

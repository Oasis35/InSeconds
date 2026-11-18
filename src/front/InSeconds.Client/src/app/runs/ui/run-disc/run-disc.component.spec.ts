import { TestBed } from '@angular/core/testing';
import { RunDiscComponent } from './run-disc.component';

describe('RunDiscComponent', () => {
  function render(disc: string) {
    const fixture = TestBed.createComponent(RunDiscComponent);
    fixture.componentRef.setInput('disc', disc);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGElement;
  }

  it('dessine le disque demandé, décoratif', () => {
    const svg = render('runs.discs.bronze');

    expect(svg.getAttribute('data-disc')).toBe('runs.discs.bronze');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('circle')?.getAttribute('fill')).toBe('var(--disc-bronze)');
  });

  it('seul le disque d\'or brille, seul le rayé a des rayures', () => {
    expect(render('runs.discs.gold').style.filter).toContain('drop-shadow');
    expect(render('runs.discs.silver').style.filter).toBe('');
    expect(render('runs.discs.scratched').querySelector('path')).not.toBeNull();
    expect(render('runs.discs.wax').querySelector('path')).toBeNull();
  });

  it('un disque inconnu (échelle future) prend la couleur de l\'or', () => {
    expect(render('runs.discs.vinyl').querySelector('circle')?.getAttribute('fill')).toBe('var(--disc-gold)');
  });

  it('les disques de niveau : platine, double platine (un second contour) et diamant', () => {
    expect(render('runs.discs.platinum').querySelector('circle')?.getAttribute('fill')).toBe('var(--disc-platinum)');
    expect(render('runs.discs.platinum').querySelector('[data-testid="disc-double"]')).toBeNull();
    expect(render('runs.discs.double_platinum').querySelector('[data-testid="disc-double"]')).not.toBeNull();
    expect(render('runs.discs.diamond').querySelector('circle')?.getAttribute('fill')).toBe('var(--disc-diamond)');
  });
});

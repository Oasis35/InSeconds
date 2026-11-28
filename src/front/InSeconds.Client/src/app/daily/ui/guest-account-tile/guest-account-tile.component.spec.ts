import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GuestTileKind } from '../../domain/toasts';
import { GuestAccountTileComponent } from './guest-account-tile.component';

function render(kind: GuestTileKind, streak = 0) {
  const fixture = TestBed.createComponent(GuestAccountTileComponent);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('streak', streak);
  const dismissed = vi.fn();
  fixture.componentInstance.dismissed.subscribe(dismissed);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, dismissed };
}

describe('GuestAccountTileComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService()] }));

  it.each(['returning', 'afterGame', 'freezeMiss'] as const)('%s : titre, phrase, « Créer un compte » et la croix qui ferme', kind => {
    const { el, dismissed } = render(kind);
    expect(el.textContent).toContain(`daily.guestTile.${kind}.title`);
    expect(el.textContent).toContain(`daily.guestTile.${kind}.body`);
    expect(el.querySelector('[data-testid="guest-tile-create"]')?.getAttribute('href')).toBe('/account/login');
    expect(el.querySelector('[data-testid="guest-tile-login"]')?.getAttribute('href')).toBe('/account/login');
    (el.querySelector('[data-testid="guest-tile-dismiss"]') as HTMLButtonElement).click();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('série perdue : sans croix', () => {
    expect(render('lost', 1).el.querySelector('[data-testid="guest-tile-dismiss"]')).toBeNull();
  });

  it.each([[1, 'one'], [9, 'other']] as const)('série perdue de %s jour(s) : le titre au cas « %s »', (streak, plural) => {
    expect(render('lost', streak).el.textContent).toContain(`daily.guestTile.lost.title.${plural}`);
  });
});

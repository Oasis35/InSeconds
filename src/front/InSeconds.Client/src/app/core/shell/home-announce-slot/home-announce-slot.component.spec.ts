import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HOME_ANNOUNCE } from './home-announce-slot';
import { HomeAnnounceSlotComponent } from './home-announce-slot.component';

@Component({ selector: 'app-test-announce', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p data-testid="announce">annonce</p>' })
class TestAnnounceComponent {}

describe('HomeAnnounceSlotComponent', () => {
  async function render(provided: boolean) {
    TestBed.configureTestingModule({
      providers: provided ? [{ provide: HOME_ANNOUNCE, useValue: { load: () => Promise.resolve(TestAnnounceComponent) } }] : [],
    });
    const fixture = TestBed.createComponent(HomeAnnounceSlotComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("charge l'annonce fournie", async () => {
    expect((await render(true)).querySelector('[data-testid="announce"]')?.textContent).toBe('annonce');
  });

  it('sans fournisseur, rien', async () => {
    expect((await render(false)).querySelector('[data-testid="announce"]')).toBeNull();
  });
});

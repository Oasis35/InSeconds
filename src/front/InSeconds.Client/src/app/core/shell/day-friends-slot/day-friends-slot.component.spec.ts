import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DAY_FRIENDS_SLOT } from './day-friends-slot';
import { DayFriendsSlotComponent } from './day-friends-slot.component';

@Component({ selector: 'app-test-friends', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p data-testid="friends">{{ date() }}</p>' })
class TestFriendsComponent {
  readonly date = input('');
}

describe('DayFriendsSlotComponent', () => {
  async function render(provided: boolean) {
    TestBed.configureTestingModule({
      providers: provided ? [{ provide: DAY_FRIENDS_SLOT, useValue: { load: () => Promise.resolve(TestFriendsComponent) } }] : [],
    });
    const fixture = TestBed.createComponent(DayFriendsSlotComponent);
    fixture.componentRef.setInput('date', '2026-11-19');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('charge le composant fourni et lui passe le jour, puis le suivant', async () => {
    const fixture = await render(true);
    const loaded = () => (fixture.nativeElement as HTMLElement).nextElementSibling;
    expect(loaded()?.textContent).toBe('2026-11-19');

    fixture.componentRef.setInput('date', '2026-11-18');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(loaded()?.textContent).toBe('2026-11-18');
  });

  it('sans fournisseur, rien', async () => {
    const fixture = await render(false);

    expect((fixture.nativeElement as HTMLElement).nextElementSibling).toBeNull();
  });
});

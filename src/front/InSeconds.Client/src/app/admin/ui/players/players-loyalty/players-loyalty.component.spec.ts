import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayersLoyaltyComponent } from './players-loyalty.component';

describe('PlayersLoyaltyComponent', () => {
  function render(rate: number | null) {
    TestBed.configureTestingModule({ imports: [PlayersLoyaltyComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(PlayersLoyaltyComponent);
    fixture.componentRef.setInput('streaks', { oneDay: 4, short: 3, long: 2, total: 9 });
    fixture.componentRef.setInput('nextDayReturnRate', rate);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('montre les séries par longueur, leur total et la part revenue le lendemain', () => {
    const element = render(61.6);

    expect(element.querySelector('[data-testid="streak-oneDay"]')?.textContent).toContain('4');
    expect(element.querySelector('[data-testid="streak-short"]')?.textContent).toContain('3');
    expect(element.querySelector('[data-testid="streak-long"]')?.textContent).toContain('2');
    expect(element.textContent).toContain('9');
    expect(element.querySelector('[data-testid="next-day-return"]')?.textContent).toContain('62 %');
  });

  it('sans joueur sur la période, pas de ligne du lendemain', () => {
    expect(render(null).querySelector('[data-testid="next-day-return"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { HomeAbandonedCardComponent } from './home-abandoned-card.component';

describe('HomeAbandonedCardComponent', () => {
  it('dit que le défi est abandonné et montre le compte à rebours', () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HomeAbandonedCardComponent);
    fixture.componentRef.setInput('countdown', '05:12:03');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('daily.alreadyPlayed.abandonedTitle');
    expect(el.querySelector('[data-testid="home-abandoned-countdown"]')?.textContent).toBe('05:12:03');
  });
});

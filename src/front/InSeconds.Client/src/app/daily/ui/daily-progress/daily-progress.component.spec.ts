import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DailyProgressComponent } from './daily-progress.component';

describe('DailyProgressComponent', () => {
  function render(currentIndex: number, trackCount: number) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DailyProgressComponent);
    fixture.componentRef.setInput('currentIndex', currentIndex);
    fixture.componentRef.setInput('trackCount', trackCount);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('la barre avance avec le morceau en cours (index 0-based)', () => {
    const { el } = render(1, 5);
    const bar = el.querySelector<HTMLElement>('.transition-all.duration-500')!;
    expect(bar.style.width).toBe('40%');
  });

  it('émet abandon au clic sur le lien', () => {
    const { fixture, el } = render(0, 5);
    const spy = vi.fn();
    fixture.componentInstance.abandon.subscribe(spy);
    el.querySelector('button')!.click();
    expect(spy).toHaveBeenCalled();
  });
});

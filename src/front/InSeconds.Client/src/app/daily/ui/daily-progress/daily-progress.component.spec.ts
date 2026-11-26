import { Component, signal } from '@angular/core';
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

  it('affiche le total projeté dans [progressTotal] à côté du numéro du morceau, et rien sans lui', () => {
    @Component({
      imports: [DailyProgressComponent],
      template: `
        <app-daily-progress [currentIndex]="0" [trackCount]="5">
          @if (withTotal()) { <span progressTotal data-testid="total">· Total 350</span> }
        </app-daily-progress>`,
    })
    class Host {
      readonly withTotal = signal(true);
    }
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const label = el.querySelector('span.justify-between, .justify-between > span')!;
    expect(label.querySelector('[data-testid="total"]')?.textContent).toBe('· Total 350');

    fixture.componentInstance.withTotal.set(false);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="total"]')).toBeNull();
  });
});

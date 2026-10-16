import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { GelEarnedToastComponent } from './gel-earned-toast.component';

describe('GelEarnedToastComponent', () => {
  @Component({
    imports: [GelEarnedToastComponent],
    template: `<app-gel-earned-toast [streak]="7" [freezes]="2" [maxFreezes]="3" (dismissed)="count = count + 1" />`,
  })
  class Host {
    count = 0;
  }

  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  it('affiche le titre et le corps', () => {
    const { el, text } = render();
    expect(el.querySelector('[data-testid="gel-earned-toast"]')).not.toBeNull();
    expect(text()).toContain('daily.streakFreeze.earnedToast.titleHighlight');
    expect(text()).toContain('daily.streakFreeze.earnedToast.body');
  });

  it('montre le stock (2 pleines sur 3) avec la dernière pleine animée', () => {
    const { el } = render();
    expect(el.querySelectorAll('[data-testid="freeze-cell-full"]')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="freeze-cell-empty"]')).toHaveLength(1);
    expect(el.querySelectorAll('app-freeze-cells [data-anim]')).toHaveLength(1);
  });

  it('le bouton ✕ émet dismissed', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.count).toBe(1);
  });
});

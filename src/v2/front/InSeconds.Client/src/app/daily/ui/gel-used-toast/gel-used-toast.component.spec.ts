import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { GelUsedToastComponent } from './gel-used-toast.component';

describe('GelUsedToastComponent', () => {
  @Component({
    imports: [GelUsedToastComponent],
    template: `<app-gel-used-toast [freezesUsed]="used" [streak]="8" (dismissed)="count = count + 1" />`,
  })
  class Host {
    used = 1;
    count = 0;
  }

  function render(used = 1) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.used = used;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  it('un gel : clés au singulier', () => {
    const { el, text } = render(1);
    expect(el.querySelector('[data-testid="gel-used-toast"]')).not.toBeNull();
    expect(text()).toContain('daily.streakFreeze.usedToast.title.one');
    expect(text()).toContain('daily.streakFreeze.usedToast.body.one');
  });

  it('plusieurs gels : clés au pluriel', () => {
    expect(render(2).text()).toContain('daily.streakFreeze.usedToast.title.other');
  });

  it('le bouton ✕ émet dismissed', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.count).toBe(1);
  });
});

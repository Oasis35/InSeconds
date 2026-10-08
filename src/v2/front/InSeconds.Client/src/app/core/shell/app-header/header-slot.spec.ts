import { Component, TemplateRef, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AppHeaderComponent } from './app-header.component';
import { HeaderSlot } from './header-slot';

@Component({
  imports: [AppHeaderComponent],
  template: `
    <ng-template #pill><button data-testid="slot-content">série 4</button></ng-template>
    <ng-template #other><span>autre page</span></ng-template>
    <app-header />`,
})
class Host {
  readonly pill = viewChild.required<TemplateRef<unknown>>('pill');
  readonly other = viewChild.required<TemplateRef<unknown>>('other');
}

describe('HeaderSlot', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, slot: TestBed.inject(HeaderSlot), element: fixture.nativeElement as HTMLElement };
  }

  it("l'emplacement de gauche de l'en-tête est vide tant qu'aucune page ne le remplit", () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="header-streak"]')?.textContent?.trim()).toBe('');
  });

  it('affiche le gabarit de la page à la place de la série, et le retire quand la page part', () => {
    const { fixture, host, slot, element } = render();

    slot.show(host.pill());
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="header-streak"] [data-testid="slot-content"]')?.textContent).toBe('série 4');

    slot.clear(host.pill());
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="slot-content"]')).toBeNull();
  });

  it("une page qui part ne retire pas le gabarit qu'une autre page a posé entre-temps", () => {
    const { fixture, host, slot, element } = render();

    slot.show(host.pill());
    slot.show(host.other());
    slot.clear(host.pill());
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="header-streak"]')?.textContent).toContain('autre page');
  });
});

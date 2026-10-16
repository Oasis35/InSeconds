import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';
import { AppHeaderComponent } from './app-header.component';
import { HeaderSlot } from './header-slot';

describe('AppHeaderComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(AppHeaderComponent);
    TestBed.inject(SessionStore).markLoaded();
    fixture.detectChanges();
    return { fixture, slot: TestBed.inject(HeaderSlot), element: fixture.nativeElement as HTMLElement };
  }

  it('affiche le lien de compte en haut à droite', () => {
    const { element } = render();

    expect(element.querySelector('a[href="/account/login"]')).not.toBeNull();
  });

  it("s'efface tant qu'une page affiche son propre en-tête, et revient quand elle part", () => {
    const { fixture, slot, element } = render();
    const page = {};

    slot.takeOver(page);
    fixture.detectChanges();
    expect(element.querySelector('app-account-link')).toBeNull();

    slot.release(page);
    fixture.detectChanges();
    expect(element.querySelector('a[href="/account/login"]')).not.toBeNull();
  });
});

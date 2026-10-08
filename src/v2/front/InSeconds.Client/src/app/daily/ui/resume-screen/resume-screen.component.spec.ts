import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ResumeScreenComponent } from './resume-screen.component';

describe('ResumeScreenComponent', () => {
  function render(linked = false) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(ResumeScreenComponent);
    fixture.componentRef.setInput('completedCount', 1);
    fixture.componentRef.setInput('trackCount', 3);
    fixture.componentRef.setInput('linked', linked);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, buttons: () => Array.from(el.querySelectorAll('button')) };
  }

  it('émet resumeGame depuis le premier bouton', () => {
    const { fixture, buttons } = render();
    const spy = vi.fn();
    fixture.componentInstance.resumeGame.subscribe(spy);
    buttons()[0].click();
    expect(spy).toHaveBeenCalled();
  });

  it('abandon : confirmation en deux temps, annulable', () => {
    const { fixture, el, buttons } = render();
    const spy = vi.fn();
    fixture.componentInstance.abandon.subscribe(spy);
    buttons()[1].click();
    fixture.detectChanges();
    expect(spy).not.toHaveBeenCalled();
    expect(el.textContent).toContain('daily.resume.warningTitle');
    buttons()[1].click();
    fixture.detectChanges();
    expect(el.textContent).toContain('daily.resume.title');
    expect(spy).not.toHaveBeenCalled();
  });

  it('confirmer émet abandon', () => {
    const { fixture, buttons } = render();
    const spy = vi.fn();
    fixture.componentInstance.abandon.subscribe(spy);
    buttons()[1].click();
    fixture.detectChanges();
    buttons()[0].click();
    expect(spy).toHaveBeenCalled();
  });

  it('invité : CTA de connexion ; connecté : non', () => {
    expect(render(false).el.querySelector('a[href="/account/login"]')).not.toBeNull();
    expect(render(true).el.querySelector('a[href="/account/login"]')).toBeNull();
  });

  it('avertit un invité de la perte de série, un connecté d un possible gel', () => {
    const guest = render(false);
    guest.buttons()[1].click();
    guest.fixture.detectChanges();
    expect(guest.el.textContent).toContain('daily.resume.warningBody');
    expect(guest.el.textContent).not.toContain('daily.resume.warningBodyLinked');
    const linked = render(true);
    linked.buttons()[1].click();
    linked.fixture.detectChanges();
    expect(linked.el.textContent).toContain('daily.resume.warningBodyLinked');
  });
});

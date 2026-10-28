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
    fixture.componentRef.setInput('showLoginCta', !linked);
    fixture.componentRef.setInput('warningBodyKey', linked ? 'daily.resume.warningBodyLinked' : 'daily.resume.warningBody');
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

  it('propose de se connecter seulement si le mode le demande', () => {
    expect(render(false).el.querySelector('a[href="/account/login"]')).not.toBeNull();
    expect(render(true).el.querySelector('a[href="/account/login"]')).toBeNull();
  });

  it("montre l'avertissement d'abandon que le mode donne", () => {
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

  it('donne la date si le mode la passe, et accorde « morceau » au nombre déjà joué', () => {
    const { fixture, el } = render();
    expect(el.textContent).toContain('daily.resume.progress.one');
    fixture.componentRef.setInput('completedCount', 2);
    fixture.componentRef.setInput('dateLabel', 'mardi 28 octobre');
    fixture.detectChanges();
    expect(el.textContent).toContain('daily.resume.progress.other');
    expect(el.textContent).toContain('mardi 28 octobre');
  });
});

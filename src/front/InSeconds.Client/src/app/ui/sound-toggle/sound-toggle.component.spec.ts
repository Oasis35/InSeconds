import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SoundToggleComponent } from './sound-toggle.component';

describe('SoundToggleComponent', () => {
  function setup(enabled: boolean) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(SoundToggleComponent);
    fixture.componentRef.setInput('enabled', enabled);
    fixture.detectChanges();
    return fixture;
  }

  it('annonce son état (aria-pressed) sous un nom fixe quand les sons sont actifs', () => {
    const button: HTMLButtonElement = setup(true).nativeElement.querySelector('[data-testid="sound-toggle"]');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('ui.sound.label');
  });

  it("annonce l'état coupé, et émet au clic", () => {
    const fixture = setup(false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => toggles++);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sound-toggle"]');
    expect(button.getAttribute('aria-label')).toBe('ui.sound.label');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(toggles).toBe(1);
  });

  it("montre la bulle d'invitation seulement quand la page le demande", () => {
    const fixture = setup(true);
    expect(fixture.nativeElement.querySelector('[data-testid="sound-hint"]')).toBeNull();
    fixture.componentRef.setInput('hint', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sound-hint"]')).not.toBeNull();
  });
});

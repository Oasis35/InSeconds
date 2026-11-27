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

  it('annonce son état et propose de couper quand les sons sont actifs', () => {
    const button: HTMLButtonElement = setup(true).nativeElement.querySelector('[data-testid="sound-toggle"]');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('ui.sound.turnOff');
  });

  it('propose de les activer quand ils sont coupés, et émet au clic', () => {
    const fixture = setup(false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => toggles++);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sound-toggle"]');
    expect(button.getAttribute('aria-label')).toBe('ui.sound.turnOn');
    button.click();
    expect(toggles).toBe(1);
  });
});

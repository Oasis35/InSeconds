import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { VersionService } from '../../version/version.service';
import { UpdatePromptComponent } from './update-prompt.component';

describe('UpdatePromptComponent', () => {
  function render(updateAvailable: boolean) {
    const available = signal(updateAvailable);
    const version = { updateAvailable: available.asReadonly(), reload: vi.fn(), dismiss: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideTranslateService(), { provide: VersionService, useValue: version }] });
    const fixture = TestBed.createComponent(UpdatePromptComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const prompt = () => element.querySelector<HTMLElement>('[data-testid="update-prompt"]');
    const button = (key: string) => Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(key));
    return { fixture, version, available, prompt, button };
  }

  it('rien à l\'écran tant qu\'aucune mise à jour n\'est signalée (le secours n\'est pas le chemin ordinaire)', () => {
    const { prompt } = render(false);

    expect(prompt()).toBeNull();
  });

  it('une mise à jour signalée : le bandeau, annoncé comme un statut, avec son texte et ses deux boutons', () => {
    const { prompt, button } = render(true);

    expect(prompt()).not.toBeNull();
    expect(prompt()!.getAttribute('role')).toBe('status');
    expect(prompt()!.textContent).toContain('shell.update.body');
    expect(button('shell.update.reload')).toBeDefined();
    expect(button('shell.update.later')).toBeDefined();
  });

  it('« Recharger » recharge, sans rien écarter', () => {
    const { version, button } = render(true);

    button('shell.update.reload')!.click();

    expect(version.reload).toHaveBeenCalledTimes(1);
    expect(version.dismiss).not.toHaveBeenCalled();
  });

  it('« Plus tard » écarte le bandeau, sans recharger', () => {
    const { version, button } = render(true);

    button('shell.update.later')!.click();

    expect(version.dismiss).toHaveBeenCalledTimes(1);
    expect(version.reload).not.toHaveBeenCalled();
  });

  it('suit le service : le bandeau apparaît quand la mise à jour arrive et part quand elle est écartée', () => {
    const { fixture, available, prompt } = render(false);

    available.set(true);
    fixture.detectChanges();
    expect(prompt()).not.toBeNull();

    available.set(false);
    fixture.detectChanges();
    expect(prompt()).toBeNull();
  });
});

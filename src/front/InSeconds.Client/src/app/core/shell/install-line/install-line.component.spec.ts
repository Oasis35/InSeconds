import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { InstallMode } from '../../pwa/install-environment';
import { InstallPromptService } from '../../pwa/install-prompt.service';
import { INSTALL_LINE_MIN_GAMES, InstallLineComponent } from './install-line.component';

describe('InstallLineComponent', () => {
  function render(mode: InstallMode | null, gamesPlayed: number | null, dismissed = false) {
    const modeSignal = signal<InstallMode | null>(mode);
    const dismissedSignal = signal(dismissed);
    const service = { mode: modeSignal, lineDismissed: dismissedSignal, dismissLine: vi.fn(() => dismissedSignal.set(true)), promptNative: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({ providers: [provideTranslateService(), { provide: InstallPromptService, useValue: service }] });
    const fixture = TestBed.createComponent(InstallLineComponent);
    fixture.componentRef.setInput('gamesPlayed', gamesPlayed);
    fixture.detectChanges();
    return { fixture, service, el: fixture.nativeElement as HTMLElement };
  }
  const line = (el: HTMLElement) => el.querySelector('[data-testid="install-line"]');
  const click = (el: HTMLElement, id: string) => (el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();

  it(`n'apparaît qu'à partir de la ${INSTALL_LINE_MIN_GAMES}e partie finie`, () => {
    expect(line(render('native', 1).el)).toBeNull();
    TestBed.resetTestingModule();
    expect(line(render('native', INSTALL_LINE_MIN_GAMES).el)).not.toBeNull();
    TestBed.resetTestingModule();
    expect(line(render('native', null).el)).toBeNull();
  });

  it("n'apparaît pas quand l'installation n'est pas possible ou que la ligne a été fermée", () => {
    expect(line(render(null, 5).el)).toBeNull();
    TestBed.resetTestingModule();
    expect(line(render('native', 5, true).el)).toBeNull();
  });

  it("Android : « Ajouter » lance l'invite du navigateur", () => {
    const { el, service } = render('native', 3);
    click(el, 'install-add');
    expect(service.promptNative).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="install-steps"]')).toBeNull();
  });

  it('iPhone : « Ajouter » déplie les étapes de Safari, sans invite', () => {
    const { el, fixture, service } = render('ios', 3);
    click(el, 'install-add');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="install-steps"]')).not.toBeNull();
    expect(service.promptNative).not.toHaveBeenCalled();
  });

  it('la croix ferme la ligne pour de bon', () => {
    const { el, fixture, service } = render('native', 3);
    click(el, 'install-dismiss');
    fixture.detectChanges();
    expect(service.dismissLine).toHaveBeenCalledTimes(1);
    expect(line(el)).toBeNull();
  });
});

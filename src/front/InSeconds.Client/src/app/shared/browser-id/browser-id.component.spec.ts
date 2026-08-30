import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BrowserIdComponent } from './browser-id.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { PlayerSessionService } from '../../core/services/player-session.service';

// Pas de fixture.detectChanges() ici (comme blind-round.component.spec.ts) : le template
// utilise TranslatePipe, qui exigerait un TranslateService complet. Les signals/méthodes
// protégés sont exercés directement via bracket-notation, sans rendre le template.
describe('BrowserIdComponent', () => {
  let component: BrowserIdComponent;
  let clipboard: ClipboardService;
  const fakeId = 'aaaaaaaa-0000-0000-0000-000000000001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PlayerSessionService,
          useValue: { playerId: signal<string | null>(fakeId) },
        },
      ],
    });

    const fixture = TestBed.createComponent(BrowserIdComponent);
    component = fixture.componentInstance;
    clipboard = TestBed.inject(ClipboardService);
  });

  it('should expose the current player id via PlayerSessionService', () => {
    expect(component['identity'].playerId()).toBe(fakeId);
  });

  it('should start with copied=false', () => {
    expect(component['copied']()).toBeFalse();
  });

  it('should set copied=true after a successful copy', async () => {
    spyOn(clipboard, 'copy').and.returnValue(Promise.resolve(true));

    component['copy'](fakeId);
    await Promise.resolve();

    expect(clipboard.copy).toHaveBeenCalledWith(fakeId);
    expect(component['copied']()).toBeTrue();
  });

  it('should not set copied=true when the copy fails', async () => {
    spyOn(clipboard, 'copy').and.returnValue(Promise.resolve(false));

    component['copy'](fakeId);
    await Promise.resolve();

    expect(component['copied']()).toBeFalse();
  });
});

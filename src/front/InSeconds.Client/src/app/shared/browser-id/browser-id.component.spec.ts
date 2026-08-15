import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BrowserIdComponent } from './browser-id.component';
import { ClipboardService } from '../../core/services/clipboard.service';
import { environment } from '../../../environments/environment';

// Pas de fixture.detectChanges() ici (comme blind-round.component.spec.ts) : le template
// utilise TranslatePipe, qui exigerait un TranslateService complet. Les signals/méthodes
// protégés sont exercés directement via bracket-notation, sans rendre le template.
describe('BrowserIdComponent', () => {
  let component: BrowserIdComponent;
  let httpMock: HttpTestingController;
  let clipboard: ClipboardService;
  const meUrl = `${environment.apiUrl}/api/players/me`;
  const fakeId = 'aaaaaaaa-0000-0000-0000-000000000001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const fixture = TestBed.createComponent(BrowserIdComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    clipboard = TestBed.inject(ClipboardService);

    httpMock.expectOne(meUrl).flush({ playerId: fakeId });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should expose the current player id via PlayerIdentityService', () => {
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

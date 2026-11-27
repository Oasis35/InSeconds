import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MemoryStoragePort, StoragePort } from '../../storage/storage.port';
import { FakeSoundPort, SoundPort } from '../../sound/sound.port';
import { SoundLinkComponent } from './sound-link.component';

describe('SoundLinkComponent', () => {
  it('coupe puis rallume les bruitages au clic', () => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), { provide: StoragePort, useValue: new MemoryStoragePort() }, { provide: SoundPort, useValue: new FakeSoundPort() }],
    });
    const fixture = TestBed.createComponent(SoundLinkComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sound-toggle"]');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

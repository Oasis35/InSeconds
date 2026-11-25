import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { InstallStepsComponent } from './install-steps.component';

describe('InstallStepsComponent', () => {
  it('montre les deux étapes de Safari, dans l\'ordre', () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(InstallStepsComponent);
    fixture.detectChanges();
    const steps = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li')).map(li => li.textContent?.trim());
    expect(steps).toEqual(['shell.install.step1', 'shell.install.step2']);
  });
});

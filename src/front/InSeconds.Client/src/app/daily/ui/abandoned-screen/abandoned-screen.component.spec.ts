import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AbandonedScreenComponent } from './abandoned-screen.component';

describe('AbandonedScreenComponent', () => {
  it('affiche le message et le compte à rebours, sans score ni partage', () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(AbandonedScreenComponent);
    fixture.componentRef.setInput('countdown', '01:02:03');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('01:02:03');
    expect(element.textContent).toContain('daily.alreadyPlayed.abandonedTitle');
    expect(element.querySelector('app-share-button')).toBeNull();
  });
});

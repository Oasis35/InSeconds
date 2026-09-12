import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ResumeScreenComponent } from './resume-screen.component';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

describe('ResumeScreenComponent', () => {
  let fixture: ComponentFixture<ResumeScreenComponent>;
  let component: ResumeScreenComponent;
  let playerSessionStub: { isLinked: ReturnType<typeof signal<boolean>> };

  beforeEach(() => {
    playerSessionStub = { isLinked: signal(false) };

    TestBed.configureTestingModule({
      imports: [ResumeScreenComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        { provide: PlayerSessionService, useValue: playerSessionStub },
      ],
    });
    fixture = TestBed.createComponent(ResumeScreenComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('completedCount', 1);
    fixture.componentRef.setInput('trackCount', 3);
  });

  it('defaults showAbandonConfirm to false', () => {
    expect(component['showAbandonConfirm']()).toBeFalse();
  });

  it('emits resumeGame and abandon on demand', () => {
    const resumeSpy = jasmine.createSpy('resumeGame');
    const abandonSpy = jasmine.createSpy('abandon');
    component.resumeGame.subscribe(resumeSpy);
    component.abandon.subscribe(abandonSpy);

    component.resumeGame.emit();
    component.abandon.emit();

    expect(resumeSpy).toHaveBeenCalled();
    expect(abandonSpy).toHaveBeenCalled();
  });

  it('reflects PlayerSessionService.isLinked() for the guest login CTA', () => {
    expect(component['playerSession'].isLinked()).toBeFalse();
    playerSessionStub.isLinked.set(true);
    expect(component['playerSession'].isLinked()).toBeTrue();
  });
});

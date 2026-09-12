import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { LoginNudgeBannerComponent } from './login-nudge-banner.component';

describe('LoginNudgeBannerComponent', () => {
  let fixture: ComponentFixture<LoginNudgeBannerComponent>;
  let component: LoginNudgeBannerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginNudgeBannerComponent],
      providers: [provideTranslateService(), provideRouter([])],
    });
    fixture = TestBed.createComponent(LoginNudgeBannerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('titleKey', 'loginNudge.keepScoreTitle');
    fixture.componentRef.setInput('bodyKey', 'loginNudge.keepScoreBody');
  });

  it('exposes the given titleKey/bodyKey', () => {
    expect(component.titleKey()).toBe('loginNudge.keepScoreTitle');
    expect(component.bodyKey()).toBe('loginNudge.keepScoreBody');
  });

  it('defaults bodyParams to an empty object', () => {
    expect(component.bodyParams()).toEqual({});
  });

  it('exposes bodyParams once set (ex: streak interpolation)', () => {
    fixture.componentRef.setInput('bodyParams', { streak: 5 });
    expect(component.bodyParams()).toEqual({ streak: 5 });
  });
});

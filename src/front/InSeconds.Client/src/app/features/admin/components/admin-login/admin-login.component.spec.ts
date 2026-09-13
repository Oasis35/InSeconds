import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminLoginComponent } from './admin-login.component';
import { AdminApiService } from '../../services/admin-api.service';

describe('AdminLoginComponent', () => {
  let component: AdminLoginComponent;
  let apiStub: { login: jasmine.Spy };

  beforeEach(() => {
    apiStub = { login: jasmine.createSpy('login') };

    TestBed.configureTestingModule({
      providers: [{ provide: AdminApiService, useValue: apiStub }],
    });

    component = TestBed.runInInjectionContext(() => new AdminLoginComponent());
  });

  it('sets loginStatus to idle and clears the password on success', async () => {
    apiStub.login.and.returnValue(Promise.resolve());
    component['password'] = 'secret';

    component.login();
    expect(component['loginStatus']()).toBe('loading');
    await Promise.resolve().then(() => Promise.resolve());

    expect(component['loginStatus']()).toBe('idle');
    expect(component['password']).toBe('');
  });

  it('sets loginStatus to error on a plain 401', async () => {
    apiStub.login.and.returnValue(
      Promise.reject(new HttpErrorResponse({ status: 401 }))
    );

    component.login();
    await Promise.resolve().then(() => Promise.resolve());

    expect(component['loginStatus']()).toBe('error');
  });

  it('sets loginStatus to rate_limited on a 429 (admin-login rate limiter)', async () => {
    apiStub.login.and.returnValue(
      Promise.reject(new HttpErrorResponse({ status: 429 }))
    );

    component.login();
    await Promise.resolve().then(() => Promise.resolve());

    expect(component['loginStatus']()).toBe('rate_limited');
  });

  it('sets loginStatus to error on a non-HttpErrorResponse rejection (e.g. network failure)', async () => {
    apiStub.login.and.returnValue(Promise.reject(new Error('network down')));

    component.login();
    await Promise.resolve().then(() => Promise.resolve());

    expect(component['loginStatus']()).toBe('error');
  });
});

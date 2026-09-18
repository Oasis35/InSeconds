import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ActionsTabComponent } from './actions-tab.component';
import { AdminActionsService } from '../../services/admin-actions.service';
import { AdminApiService } from '../../services/admin-api.service';
import { SettingsService } from '../../../../core/services/settings.service';

describe('ActionsTabComponent', () => {
  let component: ActionsTabComponent;
  let actions: AdminActionsService;
  let apiStub: { updateTrackCooldownDays: jasmine.Spy; refreshReleaseYears: jasmine.Spy };
  let settingsStub: { trackCooldownDays: ReturnType<typeof signal<number>>; load: jasmine.Spy };

  beforeEach(() => {
    apiStub = {
      updateTrackCooldownDays: jasmine.createSpy('updateTrackCooldownDays'),
      refreshReleaseYears: jasmine.createSpy('refreshReleaseYears'),
    };
    settingsStub = {
      trackCooldownDays: signal(30),
      load: jasmine.createSpy('load').and.returnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminActionsService,
        { provide: AdminApiService, useValue: apiStub },
        { provide: SettingsService, useValue: settingsStub },
      ],
    });

    actions = TestBed.inject(AdminActionsService);
    component = TestBed.runInInjectionContext(() => new ActionsTabComponent());
  });

  it('exposes the current trackCooldownDays value from SettingsService', () => {
    expect(component['settings'].trackCooldownDays()).toBe(30);
  });

  describe('updateTrackCooldownDays()', () => {
    it('calls the API and sets success status', () => {
      apiStub.updateTrackCooldownDays.and.returnValue(of({ trackCooldownDays: 45 }));

      actions.updateTrackCooldownDays(45);

      expect(apiStub.updateTrackCooldownDays).toHaveBeenCalledWith(45);
      expect(actions.updateCooldownStatus()).toBe('success');
      expect(settingsStub.load).toHaveBeenCalled();
    });

    it('sets error status on failure', () => {
      apiStub.updateTrackCooldownDays.and.returnValue(throwError(() => new Error('boom')));

      actions.updateTrackCooldownDays(0);

      expect(actions.updateCooldownStatus()).toBe('error');
    });
  });

  describe('refreshReleaseYears()', () => {
    it('calls the API and stores the result on success', () => {
      apiStub.refreshReleaseYears.and.returnValue(of({ checked: 55, updated: 55, failed: 0 }));

      actions.refreshReleaseYears();

      expect(apiStub.refreshReleaseYears).toHaveBeenCalled();
      expect(actions.refreshReleaseYearsStatus()).toBe('success');
      expect(actions.refreshReleaseYearsResult()).toEqual({ checked: 55, updated: 55, failed: 0 });
    });

    it('sets error status on failure', () => {
      apiStub.refreshReleaseYears.and.returnValue(throwError(() => new Error('boom')));

      actions.refreshReleaseYears();

      expect(actions.refreshReleaseYearsStatus()).toBe('error');
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { LeaveConfirmationService } from './leave-confirmation.service';

describe('LeaveConfirmationService', () => {
  let service: LeaveConfirmationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LeaveConfirmationService] });
    service = TestBed.inject(LeaveConfirmationService);
  });

  it('defaults to hidden with no pending confirmation', () => {
    expect(service.showLeaveConfirm()).toBeFalse();
    expect(service.hasPending).toBeFalse();
  });

  it('request() shows the modal and resolves the returned promise on confirm()', async () => {
    const pending = service.request();
    expect(service.showLeaveConfirm()).toBeTrue();
    expect(service.hasPending).toBeTrue();

    service.confirm();

    expect(await pending).toBeTrue();
    expect(service.showLeaveConfirm()).toBeFalse();
    expect(service.hasPending).toBeFalse();
  });

  it('request() resolves false on cancel()', async () => {
    const pending = service.request();
    service.cancel();
    expect(await pending).toBeFalse();
  });

  it('a re-entrant request() resolves the previous pending promise with false', async () => {
    const first = service.request();
    const second = service.request();

    expect(await first).toBeFalse();

    service.confirm();
    expect(await second).toBeTrue();
  });

  it('resolve(ok) settles the pending promise directly', async () => {
    const pending = service.request();
    service.resolve(true);
    expect(await pending).toBeTrue();
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AdminAllowedEmailsService } from './admin-allowed-emails.service';
import { AdminApiService } from './admin-api.service';
import { AllowedEmailDto } from '../../../api/api.generated';

function makeAdminApiStub() {
  return {
    allowedEmails: signal<AllowedEmailDto[]>([]),
    allowedEmailsLoading: signal(false),
    addAllowedEmail: jasmine.createSpy('addAllowedEmail'),
    removeAllowedEmail: jasmine.createSpy('removeAllowedEmail'),
    reloadAllowedEmails: jasmine.createSpy('reloadAllowedEmails'),
  };
}

describe('AdminAllowedEmailsService', () => {
  let service: AdminAllowedEmailsService;
  let apiStub: ReturnType<typeof makeAdminApiStub>;

  beforeEach(() => {
    apiStub = makeAdminApiStub();

    TestBed.configureTestingModule({
      providers: [
        AdminAllowedEmailsService,
        { provide: AdminApiService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(AdminAllowedEmailsService);
  });

  describe('add()', () => {
    it('should call the API and reload on success', () => {
      apiStub.addAllowedEmail.and.returnValue(of({ id: 1, email: 'a@b.com' }));

      service.add('a@b.com');

      expect(apiStub.addAllowedEmail).toHaveBeenCalledWith('a@b.com');
      expect(apiStub.reloadAllowedEmails).toHaveBeenCalled();
      expect(service.addStatus()).toBe('idle');
    });

    it('should set duplicate error reason on 409', () => {
      apiStub.addAllowedEmail.and.returnValue(throwError(() => ({ status: 409 })));

      service.add('a@b.com');

      expect(service.addStatus()).toBe('error');
      expect(service.addErrorReason()).toBe('duplicate');
    });

    it('should set invalid error reason on 400', () => {
      apiStub.addAllowedEmail.and.returnValue(throwError(() => ({ status: 400 })));

      service.add('pas-un-email');

      expect(service.addErrorReason()).toBe('invalid');
    });

    it('should set other error reason otherwise', () => {
      apiStub.addAllowedEmail.and.returnValue(throwError(() => ({ status: 500 })));

      service.add('a@b.com');

      expect(service.addErrorReason()).toBe('other');
    });
  });

  describe('remove()', () => {
    it('should call the API and reload on success', () => {
      apiStub.removeAllowedEmail.and.returnValue(of(void 0));

      service.remove(1);

      expect(apiStub.removeAllowedEmail).toHaveBeenCalledWith(1);
      expect(apiStub.reloadAllowedEmails).toHaveBeenCalled();
      expect(service.removeStatus()).toBe('idle');
    });

    it('should set error status on failure', () => {
      apiStub.removeAllowedEmail.and.returnValue(throwError(() => new Error('fail')));

      service.remove(1);

      expect(service.removeStatus()).toBe('error');
    });
  });
});

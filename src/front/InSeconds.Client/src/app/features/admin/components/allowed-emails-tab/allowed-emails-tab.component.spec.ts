import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AllowedEmailsTabComponent } from './allowed-emails-tab.component';
import { AdminAllowedEmailsService } from '../../services/admin-allowed-emails.service';
import { AllowedEmailDto } from '../../../../api/api.generated';

describe('AllowedEmailsTabComponent', () => {
  let component: AllowedEmailsTabComponent;
  let allowedEmailsStub: {
    allowedEmails: ReturnType<typeof signal<AllowedEmailDto[]>>;
    add: jasmine.Spy;
    remove: jasmine.Spy;
  };

  const entry: AllowedEmailDto = { id: 1, email: 'a@b.com', createdAt: new Date(), isActivated: false } as AllowedEmailDto;

  beforeEach(() => {
    allowedEmailsStub = {
      allowedEmails: signal<AllowedEmailDto[]>([entry]),
      add: jasmine.createSpy('add'),
      remove: jasmine.createSpy('remove'),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AdminAllowedEmailsService, useValue: allowedEmailsStub }],
    });

    component = TestBed.runInInjectionContext(() => new AllowedEmailsTabComponent());
  });

  describe('add()', () => {
    it('should call the service with the trimmed email and clear the input', () => {
      component['newEmail'] = '  a@b.com  ';
      component.add();

      expect(allowedEmailsStub.add).toHaveBeenCalledWith('a@b.com');
      expect(component['newEmail']).toBe('');
    });

    it('should do nothing for an empty email', () => {
      component['newEmail'] = '   ';
      component.add();

      expect(allowedEmailsStub.add).not.toHaveBeenCalled();
    });
  });

  describe('delete confirmation flow', () => {
    it('should open, then confirm and call remove', () => {
      component.openDeleteConfirm(entry);
      expect(component['deleteTarget']()).toBe(entry);

      component.confirmDelete();
      expect(allowedEmailsStub.remove).toHaveBeenCalledWith(1);
      expect(component['deleteTarget']()).toBeNull();
    });

    it('should cancel without calling remove', () => {
      component.openDeleteConfirm(entry);
      component.cancelDelete();

      expect(component['deleteTarget']()).toBeNull();
      expect(allowedEmailsStub.remove).not.toHaveBeenCalled();
    });
  });
});

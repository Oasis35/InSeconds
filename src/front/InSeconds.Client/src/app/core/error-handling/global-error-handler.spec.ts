import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { GlobalErrorHandler } from './global-error-handler';
import { ErrorReportingService } from '../services/error-reporting.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let reporting: jasmine.SpyObj<ErrorReportingService>;

  beforeEach(() => {
    reporting = jasmine.createSpyObj<ErrorReportingService>('ErrorReportingService', ['reportError']);
    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler, { provide: ErrorReportingService, useValue: reporting }],
    });
    handler = TestBed.inject(GlobalErrorHandler);
    spyOn(console, 'error');
  });

  it('logue en console et remonte une exception JS', () => {
    const error = new Error('boom');

    handler.handleError(error);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(reporting.reportError).toHaveBeenCalledWith(error);
  });

  it('ne remonte pas une erreur HTTP (déjà gérée par l\'intercepteur)', () => {
    handler.handleError(new HttpErrorResponse({ status: 500 }));

    expect(reporting.reportError).not.toHaveBeenCalled();
  });
});

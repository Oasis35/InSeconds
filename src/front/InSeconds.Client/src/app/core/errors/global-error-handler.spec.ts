import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { GlobalErrorHandler } from './global-error-handler';
import { ErrorReportingService } from './error-reporting.service';
import { VersionService } from '../version/version.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let reporting: MockedObject<ErrorReportingService>;
  let reloadAfterStaleChunk: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reporting = {
      reportError: vi.fn().mockName('ErrorReportingService.reportError')
    } as unknown as MockedObject<ErrorReportingService>;
    reloadAfterStaleChunk = vi.fn().mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: ErrorReportingService, useValue: reporting },
        { provide: VersionService, useValue: { reloadAfterStaleChunk } },
      ],
    });
    handler = TestBed.inject(GlobalErrorHandler);
    vi.spyOn(console, 'error').mockReturnValue(undefined);
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

  it('recharge la page au lieu de remonter un module introuvable après un déploiement', () => {
    handler.handleError(new TypeError('Failed to fetch dynamically imported module: https://inseconds.cc/chunk-A.js'));

    expect(reloadAfterStaleChunk).toHaveBeenCalledTimes(1);
    expect(reporting.reportError).not.toHaveBeenCalled();
  });

  it('remonte le module introuvable quand le rechargement a déjà eu lieu', () => {
    reloadAfterStaleChunk.mockReturnValue(false);
    const error = new TypeError('Failed to fetch dynamically imported module: https://inseconds.cc/chunk-A.js');

    handler.handleError(error);

    expect(reporting.reportError).toHaveBeenCalledWith(error);
  });
});

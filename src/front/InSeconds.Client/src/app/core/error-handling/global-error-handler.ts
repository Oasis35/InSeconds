import { ErrorHandler, Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorReportingService } from '../services/error-reporting.service';

/**
 * Remplace l'ErrorHandler par défaut : garde le `console.error` (utile en dev) et remonte
 * l'erreur à l'API. Reçoit aussi les promesses rejetées et erreurs globales grâce à
 * `provideBrowserGlobalErrorListeners()`. Les erreurs HTTP sont déjà remontées par
 * `httpErrorReportingInterceptor`, avec plus de contexte : ignorées ici.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly reporting = inject(ErrorReportingService);

  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof HttpErrorResponse) return;
    this.reporting.reportError(error);
  }
}

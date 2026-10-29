import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { isStaleChunkError, VersionService } from '../version/version.service';
import { ErrorReportingService } from './error-reporting.service';

/**
 * Remplace l'ErrorHandler par défaut : garde le `console.error` (utile en dev) et remonte
 * l'erreur à l'API. Reçoit aussi les promesses rejetées et erreurs globales grâce à
 * `provideBrowserGlobalErrorListeners()`. Les erreurs HTTP sont déjà remontées par
 * `httpErrorReportingInterceptor`, avec plus de contexte : ignorées ici. Un module introuvable après un déploiement recharge
 * la page une fois (`VersionService`, lu à la demande : il dépend du routeur) et n'est pas remonté si le rechargement a lieu.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly reporting = inject(ErrorReportingService);
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof HttpErrorResponse) return;
    if (isStaleChunkError(error) && this.injector.get(VersionService).reloadAfterStaleChunk()) return;
    this.reporting.reportError(error);
  }
}

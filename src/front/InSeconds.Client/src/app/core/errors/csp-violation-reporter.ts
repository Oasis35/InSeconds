import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, Injectable, inject, provideEnvironmentInitializer } from '@angular/core';
import { ErrorReportingService } from './error-reporting.service';

/**
 * Remonte les violations de la Content-Security-Policy (G3, S14) vers `POST /api/client-errors`
 * (`source: 'csp'`), en mode `Report-Only` comme en mode bloquant : c'est ce qui dit, pendant la
 * semaine d'observation sur le staging, si la politique est trop stricte.
 *
 * Écoute l'événement `securitypolicyviolation` du document plutôt que `report-uri` : le rapport natif
 * n'a pas le format de l'API, et passerait sans cookie joueur.
 * Jamais de query string ni de fragment : l'adresse bloquée (`blockedURI`) peut en porter (jeton).
 */
@Injectable({ providedIn: 'root' })
export class CspViolationReporter {
  private readonly document = inject(DOCUMENT);
  private readonly reporting = inject(ErrorReportingService);

  /** Commence à écouter les violations du document ; appelé une fois au démarrage. */
  start(): void {
    this.document.addEventListener('securitypolicyviolation', (event) => this.onViolation(event as SecurityPolicyViolationEvent));
  }

  private onViolation(event: SecurityPolicyViolationEvent): void {
    this.reporting.report({
      source: 'csp',
      message: describeViolation(event),
      url: this.document.location?.pathname ?? null,
    });
  }
}

export function describeViolation(event: Pick<SecurityPolicyViolationEvent, 'effectiveDirective' | 'blockedURI' | 'disposition' | 'sourceFile' | 'lineNumber'>): string {
  const mode = event.disposition === 'report' ? 'report' : 'enforce';
  const blocked = event.blockedURI ? stripQuery(event.blockedURI) : 'inconnu';
  const source = event.sourceFile ? ` depuis ${stripQuery(event.sourceFile)}:${event.lineNumber}` : '';
  return `CSP (${mode}) ${event.effectiveDirective} bloque ${blocked}${source}`;
}

function stripQuery(uri: string): string {
  const cut = uri.search(/[?#]/);
  return cut === -1 ? uri : uri.slice(0, cut);
}

export function provideCspViolationReporting(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    inject(CspViolationReporter).start();
  });
}

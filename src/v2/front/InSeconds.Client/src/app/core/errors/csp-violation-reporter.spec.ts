import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CspViolationReporter, describeViolation } from './csp-violation-reporter';
import { ErrorReportingService } from './error-reporting.service';
import { environment } from '../../../environments/environment';

const base = { effectiveDirective: 'script-src-elem', blockedURI: 'https://evil.test/a.js', disposition: 'enforce', sourceFile: '', lineNumber: 0 } as const;

describe('describeViolation', () => {
  it('nomme la directive, le mode et la ressource bloquée', () => {
    expect(describeViolation(base)).toBe('CSP (enforce) script-src-elem bloque https://evil.test/a.js');
    expect(describeViolation({ ...base, disposition: 'report' })).toContain('(report)');
  });

  it('retire la query string et le fragment de la ressource et de la source', () => {
    const message = describeViolation({ ...base, blockedURI: 'https://x.test/p?token=secret#f', sourceFile: 'https://inseconds.cc/main.js?v=1', lineNumber: 7 });
    expect(message).toBe('CSP (enforce) script-src-elem bloque https://x.test/p depuis https://inseconds.cc/main.js:7');
    expect(message).not.toContain('secret');
  });

  it('accepte une ressource sans adresse (inline, eval)', () => {
    expect(describeViolation({ ...base, blockedURI: '' })).toContain('bloque inconnu');
    expect(describeViolation({ ...base, blockedURI: 'inline' })).toContain('bloque inline');
  });
});

describe('CspViolationReporter', () => {
  it('remonte une violation du document avec la source csp', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const doc = document.implementation.createHTMLDocument('t');
    new CspViolationReporter(doc, TestBed.inject(ErrorReportingService));
    const httpMock = TestBed.inject(HttpTestingController);

    const event = new Event('securitypolicyviolation');
    Object.assign(event, base);
    doc.dispatchEvent(event);

    const req = httpMock.expectOne(`${environment.apiUrl}/api/client-errors`);
    expect(req.request.body.source).toBe('csp');
    expect(req.request.body.message).toBe('CSP (enforce) script-src-elem bloque https://evil.test/a.js');
    req.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.verify();
  });
});

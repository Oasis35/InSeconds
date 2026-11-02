import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ViewportReporter, ViewportSnapshot, describeViewport, measureViewport } from './viewport-reporter';
import { environment } from '../../../environments/environment';

const fine: ViewportSnapshot = { scale: 1, layoutWidth: 390, pageWidth: 390, focus: null, widest: null, lastTouch: null };

describe('describeViewport', () => {
  it('rien à dire sur une page à l\'échelle, à la largeur de l\'écran', () => {
    expect(describeViewport('/daily', fine)).toBeNull();
    expect(describeViewport('/daily', { ...fine, scale: 1.04, pageWidth: 391 })).toBeNull();
  });

  it('décrit une page zoomée, avec l\'élément qui a le focus', () => {
    expect(describeViewport('/daily', { ...fine, scale: 1.3141, focus: 'INPUT[text]' }))
      .toBe('Viewport: /daily zoom ×1.31, écran 390 px, page 390 px, focus INPUT[text], aucun toucher');
  });

  it('décrit une page plus large que l\'écran, avec l\'élément qui dépasse', () => {
    expect(describeViewport('/daily', { ...fine, pageWidth: 412, widest: 'div.toast (16 → 412 px)' }))
      .toBe('Viewport: /daily zoom ×1.00, écran 390 px, page 412 px, focus aucun, aucun toucher, plus large : div.toast (16 → 412 px)');
  });

  it('donne le dernier élément touché et le temps écoulé, arrondi à 100 ms', () => {
    expect(describeViewport('/daily', { ...fine, scale: 1.14, lastTouch: { element: 'BUTTON', agoMs: 1234 } }))
      .toBe('Viewport: /daily zoom ×1.14, écran 390 px, page 390 px, focus aucun, dernier toucher BUTTON il y a 1200 ms');
  });
});

describe('measureViewport', () => {
  let wide: HTMLElement;
  afterEach(() => wide?.remove());

  it('trouve l\'élément qui dépasse à droite', () => {
    wide = document.createElement('div');
    wide.className = 'trop  large';
    wide.style.cssText = `position:absolute;left:0;top:0;width:${document.documentElement.clientWidth + 200}px;height:1px`;
    document.body.appendChild(wide);

    const snapshot = measureViewport(document);

    expect(snapshot.pageWidth).toBeGreaterThan(snapshot.layoutWidth);
    expect(snapshot.widest).toMatch(/^div\.trop\.large \(0 → \d+ px\)$/);
  });

  it('ne cherche rien quand la page tient dans l\'écran', () => {
    const snapshot = measureViewport(document);
    expect(snapshot.widest).toBeNull();
    expect(snapshot.scale).toBe(1);
  });
});

describe('ViewportReporter', () => {
  it('remonte une page trop large, trois fois au plus par chargement', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const reporter = TestBed.inject(ViewportReporter);
    const httpMock = TestBed.inject(HttpTestingController);
    const wide = document.createElement('div');
    document.body.appendChild(wide);

    try {
      for (let extra = 100; extra <= 400; extra += 100) {
        wide.style.cssText = `position:absolute;left:0;top:0;width:${document.documentElement.clientWidth + extra}px;height:1px`;
        const message = reporter.check();
        if (extra <= 300) {
          expect(message).toContain('Viewport: ');
          const req = httpMock.expectOne(`${environment.apiUrl}/api/client-errors`);
          expect(req.request.body.source).toBe('js');
          expect(req.request.body.message).toBe(message);
          req.flush(null, { status: 204, statusText: 'No Content' });
        } else {
          expect(message).toBeNull();
        }
      }
      httpMock.verify();
    } finally {
      wide.remove();
    }
  });

  it('retient le bouton qui contient l\'élément touché, jamais son texte', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const reporter = TestBed.inject(ViewportReporter);
    const httpMock = TestBed.inject(HttpTestingController);
    const button = document.createElement('button');
    const label = document.createElement('span');
    label.textContent = 'Écouter plus';
    button.appendChild(label);
    const wide = document.createElement('div');
    wide.style.cssText = `position:absolute;left:0;top:0;width:${document.documentElement.clientWidth + 100}px;height:1px`;
    document.body.append(button, wide);

    try {
      reporter.recordTouch(label);
      const message = reporter.check();
      expect(message).toMatch(/dernier toucher BUTTON il y a \d+ ms/);
      expect(message).not.toContain('Écouter plus');
      httpMock.expectOne(`${environment.apiUrl}/api/client-errors`).flush(null, { status: 204, statusText: 'No Content' });
      httpMock.verify();
    } finally {
      button.remove();
      wide.remove();
    }
  });

  it('ne remonte rien quand tout va bien', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(ViewportReporter).check()).toBeNull();
    TestBed.inject(HttpTestingController).verify();
  });
});

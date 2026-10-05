import { HttpErrorResponse } from '@angular/common/http';
import { NETWORK_ERROR_CODE, UNEXPECTED_ERROR_CODE, readProblemDetails, toAppError } from './app-error';

describe('toAppError', () => {
  const traceId = '0123456789abcdef0123456789abcdef';

  it('relit le code et le traceId du ProblemDetails', async () => {
    const error = new HttpErrorResponse({ status: 409, error: { code: 'daily.already_played', traceId } });

    expect(await toAppError(error)).toEqual({ code: 'daily.already_played', status: 409, traceId });
  });

  it('relit un ProblemDetails reçu en Blob (client NSwag)', async () => {
    const body = new Blob([JSON.stringify({ code: 'common.not_found', traceId })], { type: 'application/problem+json' });

    expect(await toAppError(new HttpErrorResponse({ status: 404, error: body }))).toEqual({
      code: 'common.not_found', status: 404, traceId,
    });
  });

  describe('ApiException d\'un client NSwag', () => {
    const apiException = (status: number, response: string) => ({ isApiException: true as const, status, response });

    it('relit le code et le traceId du corps de la réponse (texte JSON)', async () => {
      const error = apiException(409, JSON.stringify({ code: 'players.pseudo_taken', traceId }));

      expect(await toAppError(error)).toEqual({ code: 'players.pseudo_taken', status: 409, traceId });
    });

    it('traduit le statut 0 en erreur réseau', async () => {
      expect(await toAppError(apiException(0, ''))).toEqual({ code: NETWORK_ERROR_CODE, status: 0, traceId: null });
    });

    it('tombe sur common.unexpected quand le corps n\'est pas un ProblemDetails', async () => {
      expect(await toAppError(apiException(502, '<html>Bad Gateway</html>'))).toEqual({
        code: UNEXPECTED_ERROR_CODE, status: 502, traceId: null,
      });
    });
  });

  it('relit le ProblemDetails que lève un client NSwag quand OpenAPI le décrit', async () => {
    const problem = { status: 409, code: 'players.pseudo_taken', traceId, title: 'Conflict' };

    expect(await toAppError(problem)).toEqual({ code: 'players.pseudo_taken', status: 409, traceId });
  });

  it('traduit une absence de réponse (status 0) en erreur réseau', async () => {
    const error = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });

    expect(await toAppError(error)).toEqual({ code: NETWORK_ERROR_CODE, status: 0, traceId: null });
  });

  it('tombe sur common.unexpected quand le corps n\'a pas de code (page HTML d\'un proxy)', async () => {
    const error = new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' });

    expect(await toAppError(error)).toEqual({ code: UNEXPECTED_ERROR_CODE, status: 502, traceId: null });
  });

  it('accepte une erreur qui ne vient pas de HttpClient', async () => {
    expect(await toAppError(new Error('boom'))).toEqual({ code: UNEXPECTED_ERROR_CODE, status: 0, traceId: null });
  });

  it('renvoie null pour un corps illisible', async () => {
    expect(await readProblemDetails(new Blob(['<html>']))).toBeNull();
    expect(await readProblemDetails(null)).toBeNull();
    expect(await readProblemDetails('texte')).toBeNull();
  });
});

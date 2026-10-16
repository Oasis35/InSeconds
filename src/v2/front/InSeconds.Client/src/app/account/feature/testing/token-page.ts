import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../../data-access/session-loader';
import { FakePlayersApi, providePlayersApiFake } from '../../data-access/testing/fake-players-api';

/**
 * Prépare le `TestBed` d'une page ouverte depuis un lien d'email (`?token=…`) : traductions, routeur,
 * faux client des joueurs, et relecture de l'identité neutralisée (elle n'est pas l'objet de ces tests).
 */
export function configureTokenPage(token: string | null, api: FakePlayersApi): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTranslateService(),
      providePlayersApiFake(api),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } } },
    ],
  });
  vi.spyOn(TestBed.inject(SessionLoader), 'reload').mockResolvedValue();
}

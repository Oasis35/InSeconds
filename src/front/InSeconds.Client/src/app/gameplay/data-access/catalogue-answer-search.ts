import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogueClient } from '../../api/catalogue/api.generated';
import { AnswerSuggestion } from '../domain/answer';
import { AnswerSearchPort } from './answer-search.port';

/** L'autocomplete branché sur `GET /api/catalogue/search` (public, titres nettoyés et dédoublonnés par le back). */
@Injectable()
export class CatalogueAnswerSearch extends AnswerSearchPort {
  private readonly client = inject(CatalogueClient);

  async search(query: string): Promise<AnswerSuggestion[]> {
    const suggestions = await firstValueFrom(this.client.searchTracks(query));
    return suggestions.map(({ artist, title }) => ({ artist, title }));
  }
}

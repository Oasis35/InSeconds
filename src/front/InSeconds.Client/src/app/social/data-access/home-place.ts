import { Injectable, inject } from '@angular/core';
import { bestStanding, generalRankOf, standingOf } from '../domain/group';
import { SocialApi } from './social.api';

/** Sa place pour la carte d'accueil : sa meilleure place dans ses groupes et sa place au classement général (s'il a choisi d'y apparaître). */
export interface HomePlace {
  readonly group: { readonly name: string; readonly rank: number } | null;
  readonly general: number | null;
}

/**
 * Lit sa place dans ses groupes et au général pour la carte Setlist de l'accueil. Ce sont des plus : une erreur laisse la place vide, jamais
 * l'écran en panne. À fournir par la route ou le composant qui s'en sert, avec `provideSocialApi()`.
 */
@Injectable()
export class HomePlaceReader {
  private readonly api = inject(SocialApi);

  async load(): Promise<HomePlace> {
    const [standings, general] = await Promise.all([this.standings(), this.api.generalRanking().catch(() => null)]);
    const best = bestStanding(standings);
    return { group: best ? { name: best.name, rank: best.rank } : null, general: general ? generalRankOf(general) : null };
  }

  private async standings() {
    try {
      const { groups } = await this.api.myGroups();
      const rankings = await Promise.all(groups.map(group => this.api.ranking(group.id).catch(() => null)));
      return rankings.flatMap(ranking => (ranking ? [standingOf(ranking)] : []));
    } catch {
      return [];
    }
  }
}

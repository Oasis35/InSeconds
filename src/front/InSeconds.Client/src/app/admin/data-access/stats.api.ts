import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DailyClient, StatsCohortResponse, StatsDayResponse, StatsResponse } from '../../api/daily/api.generated';
import { CohortRow, Stats, StatsDay } from '../domain/stats';

/** Adaptateur de l'onglet Stats de l'admin (module Daily) : rend des types du domaine, jours en texte `aaaa-mm-jj`. */
@Injectable()
export class StatsApi {
  private readonly client = inject(DailyClient);

  /** Les statistiques des `days` derniers jours (7, 30 ou 90). */
  async getStats(days: number): Promise<Stats> {
    return toStats(await firstValueFrom(this.client.getStats(days)));
  }
}

function toStats(r: StatsResponse): Stats {
  return {
    days: r.days,
    daily: r.daily.map(toDay),
    medianScore: r.medianScore ?? null,
    overall: toCohort(r.overall),
    sources: r.sources.map(toCohort),
    devices: r.devices.map(toCohort),
    answers: {
      total: r.answers.total,
      artistFound: r.answers.artistFound,
      titleFound: r.answers.titleFound,
      withHint: r.answers.withHint,
      byListened: r.answers.byListened.map(b => ({ seconds: b.seconds, count: b.count })),
    },
  };
}

function toCohort(c: StatsCohortResponse): CohortRow {
  return {
    key: c.key, newPlayers: c.new, day1Eligible: c.day1Eligible, day1Returned: c.day1Returned,
    day7Eligible: c.day7Eligible, day7Returned: c.day7Returned,
  };
}

function toDay(d: StatsDayResponse): StatsDay {
  const value: Date | string = d.date;
  return {
    day: (typeof value === 'string' ? value : value.toISOString()).slice(0, 10),
    completed: d.completed, abandoned: d.abandoned, expired: d.expired, players: d.players, firstTimePlayers: d.firstTimePlayers,
  };
}

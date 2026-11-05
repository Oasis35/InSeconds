import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ArrivalResponse, DailyActivityResponse, DailyClient, DashboardResponse, DayKpisResponse, ShareCountsResponse } from '../../api/daily/api.generated';
import { ArrivalCount, Dashboard, DayActivity, DayKpis, ShareCounts } from '../domain/dashboard';

/**
 * Adaptateur du tableau de bord de l'admin (module Daily) : seule porte d'entrée vers le client
 * généré. Rend des types du domaine, jours en texte `aaaa-mm-jj`.
 */
@Injectable()
export class DashboardApi {
  private readonly client = inject(DailyClient);

  /** Le tableau de bord ; sans `day`, celui d'aujourd'hui. */
  async getDashboard(day?: string): Promise<Dashboard> {
    return toDashboard(await firstValueFrom(this.client.getDashboard(day)));
  }
}

function toDashboard(response: DashboardResponse): Dashboard {
  return {
    activity: response.dailyActivity.map(toActivity),
    players: {
      totalGuests: response.playerBreakdown.totalGuests,
      totalRegistered: response.playerBreakdown.totalRegistered,
      activeLast7Days: response.playerBreakdown.activeLast7Days,
      activeLast30Days: response.playerBreakdown.activeLast30Days,
    },
    availableDays: response.availableDates.map(toDay),
    kpis: response.selectedDayKpis ? toKpis(response.selectedDayKpis) : null,
    arrivals: response.arrivals.map(toArrival),
    shares: { selectedDay: toShares(response.shares.selectedDay), last30Days: toShares(response.shares.last30Days) },
  };
}

function toShares(shares: ShareCountsResponse): ShareCounts {
  return { short: shares.short, long: shares.long };
}

function toActivity(item: DailyActivityResponse): DayActivity {
  return { day: toDay(item.date), playerCount: item.playerCount };
}

function toKpis(kpis: DayKpisResponse): DayKpis {
  return {
    day: toDay(kpis.date),
    completedCount: kpis.completedCount,
    abandonedCount: kpis.abandonedCount,
    expiredCount: kpis.expiredCount,
    pendingCount: kpis.pendingCount,
    totalSessions: kpis.totalSessions,
    completionRate: kpis.completionRate,
    medianScore: kpis.medianScore ?? null,
    newPlayersCount: kpis.newPlayersCount,
    accountsCreatedCount: kpis.accountsCreatedCount,
    firstTimeFinishersCount: kpis.firstTimeFinishersCount,
    arrivals: kpis.arrivals.map(toArrival),
  };
}

function toArrival(arrival: ArrivalResponse): ArrivalCount {
  return { source: arrival.source, count: arrival.count };
}

/** Le client annonce un `Date`, le JSON livre un jour en texte (`2026-10-05`) : on garde le jour, sans fuseau. */
function toDay(value: Date | string): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

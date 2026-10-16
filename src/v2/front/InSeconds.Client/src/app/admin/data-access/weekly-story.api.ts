import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DailyClient, WeeklyRecapResponse, WeeklyTrackResponse } from '../../api/daily/api.generated';
import { WeeklyRecap, WeeklyTrack } from '../domain/weekly-story';

/**
 * Adaptateur du récap hebdomadaire (`api/daily`) : seule porte d'entrée vers le client généré.
 * Erreurs de l'API : `admin.invalid_date`, `admin.invalid_period` (400), lues par `toAppError`.
 */
@Injectable({ providedIn: 'root' })
export class WeeklyStoryApi {
  private readonly client = inject(DailyClient);

  /** Le morceau le plus trouvé et le plus raté des défis de la période (`aaaa-mm-jj`). */
  async getRecap(from: string, to: string): Promise<WeeklyRecap> {
    return toRecap(await firstValueFrom(this.client.getWeeklyRecap(from, to)));
  }
}

function toRecap(response: WeeklyRecapResponse): WeeklyRecap {
  return {
    status: response.status === 'ok' ? 'ok' : 'insufficient',
    from: toDay(response.from),
    to: toDay(response.to),
    minAnswers: response.minAnswers,
    mostFound: toTrack(response.mostFound),
    mostMissed: toTrack(response.mostMissed),
  };
}

function toTrack(track: WeeklyTrackResponse | undefined | null): WeeklyTrack | null {
  if (!track) return null;
  return { artist: track.artist, title: track.title, successRatePercent: track.successRatePercent, answers: track.answers };
}

/** Le client annonce un `Date`, le JSON livre un jour en texte (`2026-10-05`) : on garde le jour, sans fuseau. */
function toDay(value: Date | string): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogueClient, DeezerTrackResult, TrackListItem } from '../../api/catalogue/api.generated';
import { DeezerResult, PoolTrack, PreviewState } from '../domain/pool-track';

/**
 * Adaptateur de l'API du module Catalogue : seule porte d'entrée vers le client généré
 * (`api/catalogue`). Il rend des types du domaine et des promesses ; les erreurs sont celles du
 * client (`toAppError` sait les lire).
 */
@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly client = inject(CatalogueClient);

  /** Le pool entier, par artiste puis titre, avec l'usage de chaque morceau. */
  async listTracks(): Promise<PoolTrack[]> {
    return (await firstValueFrom(this.client.listTracks())).map(toPoolTrack);
  }

  async addTrack(deezerTrackId: number): Promise<void> {
    await firstValueFrom(this.client.addTrack({ deezerTrackId }));
  }

  async renameTrack(id: number, artist: string, title: string): Promise<void> {
    await firstValueFrom(this.client.renameTrack(id, { artist, title }));
  }

  async setTrackDisabled(id: number, isDisabled: boolean): Promise<void> {
    await firstValueFrom(this.client.setTrackDisabled(id, { isDisabled }));
  }

  async deleteTrack(id: number): Promise<void> {
    await firstValueFrom(this.client.deleteTrack(id));
  }

  /** Lance le contrôle des extraits (tâche Hangfire `catalogue-refresh`) ; rend l'identifiant de l'exécution à suivre. */
  async refreshPreviews(): Promise<string> {
    return (await firstValueFrom(this.client.refreshPreviews())).id;
  }

  /** Recherche chez Deezer, titres bruts (ce qui deviendra le titre du morceau). */
  async searchDeezer(query: string): Promise<DeezerResult[]> {
    return (await firstValueFrom(this.client.searchDeezer(query))).map(toDeezerResult);
  }

  /**
   * L'extrait d'un morceau du pool. Le pool ne garde pas l'adresse de l'extrait (elle est signée et
   * expire) : on la redemande à Deezer, en cherchant « artiste titre » et en reprenant le résultat
   * qui a le même identifiant Deezer (à défaut, le premier). `null` s'il n'y en a pas.
   */
  async findPreviewUrl(track: Pick<PoolTrack, 'artist' | 'title' | 'deezerTrackId'>): Promise<string | null> {
    const results = await this.searchDeezer(`${track.artist} ${track.title}`);
    const match = results.find(result => result.deezerTrackId === track.deezerTrackId) ?? results[0];
    return match?.previewUrl ?? null;
  }
}

function toPoolTrack(item: TrackListItem): PoolTrack {
  return {
    id: item.id,
    deezerTrackId: item.deezerTrackId,
    artist: item.artist,
    title: item.title,
    preview: toPreviewState(item.previewStatus),
    isDisabled: item.isDisabled,
    lastUsedDate: toDay(item.lastUsedDate),
    usageCount: item.usageCount,
    unlockDate: toDay(item.unlockDate),
    inTodayChallenge: item.inTodayChallenge,
  };
}

function toDeezerResult(result: DeezerTrackResult): DeezerResult {
  return {
    deezerTrackId: result.deezerTrackId,
    artist: result.artist,
    title: result.title,
    previewUrl: result.previewUrl ?? null,
  };
}

function toPreviewState(status: string): PreviewState {
  return status === 'available' || status === 'missing' ? status : 'unknown';
}

/** Le client annonce un `Date`, le JSON livre un jour en texte (`2026-10-05`) : on garde le jour, sans fuseau. */
function toDay(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

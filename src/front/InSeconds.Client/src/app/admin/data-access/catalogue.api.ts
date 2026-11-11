import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogueClient, DeezerTrackResult, TrackListItem, TrackModeUsage } from '../../api/catalogue/api.generated';
import { DeezerResult, ModeUsage, PoolTheme, PoolTrack, PreviewState } from '../domain/pool-track';

/**
 * Adaptateur de l'API du module Catalogue : seule porte d'entrée vers le client généré
 * (`api/catalogue`). Il rend des types du domaine et des promesses ; les erreurs sont celles du
 * client (`toAppError` sait les lire).
 */
@Injectable()
export class CatalogueApi {
  private readonly client = inject(CatalogueClient);

  /** Le pool entier, par artiste puis titre, avec ce que chaque mode en a fait. */
  async listTracks(): Promise<PoolTrack[]> {
    return (await firstValueFrom(this.client.listTracks())).map(toPoolTrack);
  }

  async addTrack(deezerTrackId: number): Promise<void> {
    await firstValueFrom(this.client.addTrack({ deezerTrackId }));
  }

  /** `genre` : absent, les genres ne changent pas ; vide, le genre saisi est retiré ; sinon il remplace ceux du morceau. */
  async renameTrack(id: number, artist: string, title: string, genre?: string): Promise<void> {
    await firstValueFrom(this.client.renameTrack(id, { artist, title, genre }));
  }

  async setTrackDisabled(id: number, isDisabled: boolean): Promise<void> {
    await firstValueFrom(this.client.setTrackDisabled(id, { isDisabled }));
  }

  async deleteTrack(id: number): Promise<void> {
    await firstValueFrom(this.client.deleteTrack(id));
  }

  /** La liste des thèmes de l'admin, avec le nombre de morceaux de chacun. */
  async listThemes(): Promise<PoolTheme[]> {
    return (await firstValueFrom(this.client.listThemes())).map(t => ({ id: t.id, name: t.name, trackCount: t.trackCount }));
  }

  async addTheme(name: string): Promise<void> {
    await firstValueFrom(this.client.addTheme({ name }));
  }

  async renameTheme(id: number, name: string): Promise<void> {
    await firstValueFrom(this.client.renameTheme(id, { name }));
  }

  async deleteTheme(id: number): Promise<void> {
    await firstValueFrom(this.client.deleteTheme(id));
  }

  /** Remplace les thèmes d'un morceau (jamais de saisie libre : des thèmes de la liste). */
  async setTrackThemes(id: number, themeIds: readonly number[]): Promise<void> {
    await firstValueFrom(this.client.setTrackThemes(id, { themeIds: [...themeIds] }));
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
    isUsed: item.isUsed,
    usages: item.usages.map(toModeUsage),
    genres: item.genres,
    themeIds: item.themeIds ?? [],
    inTodayChallenge: item.usages.some(usage => usage.inTodayChallenge),
  };
}

function toModeUsage(usage: TrackModeUsage): ModeUsage {
  return {
    mode: usage.mode,
    usageCount: usage.usageCount,
    lastUsedDate: toDay(usage.lastUsedDate),
    unlockDate: toDay(usage.unlockDate),
    inTodayChallenge: usage.inTodayChallenge,
    answerCount: usage.answerCount,
    foundCount: usage.foundCount,
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

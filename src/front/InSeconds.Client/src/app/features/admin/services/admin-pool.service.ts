import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService } from './admin-api.service';
import { DeezerTrackInfo, PoolTrackDto } from '../admin.models';

/** État de l'onglet pool : filtres, pagination, sélection, modales ajout/suppression, audio preview. */
@Injectable()
export class AdminPoolService {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly poolTracks = this.api.poolTracks;
  readonly poolTracksLoading = this.api.poolTracksLoading;
  readonly poolSearchResults = this.api.poolSearchResults;
  readonly poolSearchLoading = this.api.poolSearchLoading;
  readonly poolSearchQuery = this.api.poolSearchQuery;

  readonly poolPageSize = 15;
  readonly allTracksPage = signal(0);
  readonly poolFilterText = signal('');
  readonly poolFilterStatus = signal<'all' | 'available' | 'used'>('all');
  readonly poolFilterPreview = signal<'all' | 'ok' | 'missing'>('all');

  readonly selectedTrackIds = signal<Set<number>>(new Set());

  // --- modale ajout ---
  readonly addToPoolStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private addToPoolStatusTimer: ReturnType<typeof setTimeout> | null = null;
  readonly addModalOpen = signal(false);
  readonly addModalTrack = signal<DeezerTrackInfo | null>(null);
  readonly addModalTrackIdToUpdate = signal<number | null>(null);
  readonly modalPlaying = signal(false);
  readonly modalProgress = signal(0);
  private modalAudio: HTMLAudioElement | null = null;
  private modalRafId: number | null = null;

  // --- modale suppression ---
  readonly deleteModalOpen = signal(false);
  readonly deleteModalTracks = signal<PoolTrackDto[]>([]);
  readonly deleteStatus = signal<'idle' | 'loading' | 'error'>('idle');

  readonly allTracks = computed(() => {
    const available = this.poolTracks().available.map(t => ({ ...t, isAvailable: true }));
    const used = this.poolTracks().used.map(t => ({ ...t, isAvailable: false, hasPreview: null as boolean | null }));
    return [...available, ...used];
  });

  readonly filteredTracks = computed(() => {
    const text = this.poolFilterText().toLowerCase().trim();
    const status = this.poolFilterStatus();
    const preview = this.poolFilterPreview();
    return this.allTracks().filter(t => {
      if (text && !t.artist.toLowerCase().includes(text) && !t.title.toLowerCase().includes(text)) return false;
      if (status === 'available' && !t.isAvailable) return false;
      if (status === 'used' && t.isAvailable) return false;
      if (preview === 'ok' && t.hasPreview !== true) return false;
      if (preview === 'missing' && t.hasPreview !== false) return false;
      return true;
    });
  });

  readonly allTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTracks().length / this.poolPageSize)));

  readonly pagedAllTracks = computed(() => {
    const page = this.allTracksPage();
    return this.filteredTracks().slice(page * this.poolPageSize, (page + 1) * this.poolPageSize);
  });

  // --- filtres ---
  setPoolFilter(text: string): void { this.poolFilterText.set(text); this.allTracksPage.set(0); }
  setPoolFilterStatus(v: 'all' | 'available' | 'used'): void { this.poolFilterStatus.set(v); this.allTracksPage.set(0); }
  setPoolFilterPreview(v: 'all' | 'ok' | 'missing'): void { this.poolFilterPreview.set(v); this.allTracksPage.set(0); }

  onPoolSearchChange(q: string): void { this.poolSearchQuery.set(q); this.allTracksPage.set(0); }

  // --- sélection ---
  toggleSelection(id: number): void {
    const set = new Set(this.selectedTrackIds());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.selectedTrackIds.set(set);
  }

  clearSelection(): void { this.selectedTrackIds.set(new Set()); }

  // --- modale ajout ---
  openAddModal(track: DeezerTrackInfo | null, trackIdToUpdate: number | null = null, prefillSearch = ''): void {
    this.stopModalAudio();
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.addModalTrack.set(track);
    this.addModalTrackIdToUpdate.set(trackIdToUpdate);
    if (prefillSearch) this.poolSearchQuery.set(prefillSearch);
    this.addModalOpen.set(true);
  }

  selectModalTrack(track: DeezerTrackInfo): void {
    if (this.addModalTrack()?.deezerTrackId === track.deezerTrackId) return;
    this.stopModalAudio();
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.addModalTrack.set(track);
  }

  closeAddModal(): void {
    this.stopModalAudio();
    this.addModalOpen.set(false);
    this.addModalTrack.set(null);
    this.addModalTrackIdToUpdate.set(null);
    this.addToPoolStatus.set('idle');
    this.modalProgress.set(0);
    this.poolSearchQuery.set('');
  }

  toggleModalPreview(): void {
    const track = this.addModalTrack();
    if (!track?.previewUrl) return;

    if (this.modalPlaying()) {
      this.modalAudio?.pause();
      this.modalPlaying.set(false);
      if (this.modalRafId !== null) { cancelAnimationFrame(this.modalRafId); this.modalRafId = null; }
      return;
    }

    if (!this.modalAudio || this.modalAudio.src !== track.previewUrl) {
      this.stopModalAudio();
      this.modalAudio = new Audio(track.previewUrl);
      this.modalAudio.onended = () => {
        this.modalPlaying.set(false);
        this.modalProgress.set(100);
        if (this.modalRafId !== null) { cancelAnimationFrame(this.modalRafId); this.modalRafId = null; }
      };
    }

    this.modalAudio.play().then(() => {
      this.modalPlaying.set(true);
      const tick = () => {
        const audio = this.modalAudio;
        if (!audio || audio.paused) return;
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        this.modalProgress.set(pct);
        this.modalRafId = requestAnimationFrame(tick);
      };
      this.modalRafId = requestAnimationFrame(tick);
    }).catch(() => {});
  }

  private stopModalAudio(): void {
    if (this.modalRafId !== null) { cancelAnimationFrame(this.modalRafId); this.modalRafId = null; }
    if (this.modalAudio) { this.modalAudio.pause(); this.modalAudio.onended = null; this.modalAudio = null; }
    this.modalPlaying.set(false);
  }

  addToPoolFromModal(andClose: boolean): void {
    const track = this.addModalTrack();
    if (!track) return;
    this.addToPoolStatus.set('loading');

    const trackIdToUpdate = this.addModalTrackIdToUpdate();
    const req$ = trackIdToUpdate === null
      ? this.api.addTrack(track.deezerTrackId)
      : this.api.updateTrack(trackIdToUpdate, track.deezerTrackId);

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.addToPoolStatus.set('success');
        this.api.reloadPool();
        if (andClose) {
          this.poolSearchQuery.set('');
          this.closeAddModal();
        } else {
          if (this.addToPoolStatusTimer) clearTimeout(this.addToPoolStatusTimer);
          this.addToPoolStatusTimer = setTimeout(() => {
            if (this.addToPoolStatus() === 'success') this.addToPoolStatus.set('idle');
            this.addToPoolStatusTimer = null;
          }, 2000);
        }
      },
      error: () => {
        this.addToPoolStatus.set('error');
        if (this.addToPoolStatusTimer) clearTimeout(this.addToPoolStatusTimer);
        this.addToPoolStatusTimer = setTimeout(() => {
          if (this.addToPoolStatus() === 'error') this.addToPoolStatus.set('idle');
          this.addToPoolStatusTimer = null;
        }, 3000);
      },
    });
  }

  // --- modale suppression ---
  openDeleteModal(track: PoolTrackDto | null): void {
    if (track) {
      this.deleteModalTracks.set([track]);
    } else {
      const available = this.poolTracks().available;
      this.deleteModalTracks.set(available.filter(t => this.selectedTrackIds().has(t.id)));
    }
    this.deleteStatus.set('idle');
    this.deleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    this.deleteModalOpen.set(false);
    this.deleteModalTracks.set([]);
    this.deleteStatus.set('idle');
  }

  confirmDelete(): void {
    const tracks = this.deleteModalTracks();
    if (tracks.length === 0) return;
    this.deleteStatus.set('loading');

    const requests = tracks.map(t =>
      new Promise<number>((resolve, reject) => {
        this.api.deleteTrack(t.id).subscribe({ next: () => resolve(t.id), error: reject });
      })
    );

    Promise.all(requests).then(() => {
      const deleted = new Set(tracks.map(t => t.id));
      this.selectedTrackIds.set(new Set([...this.selectedTrackIds()].filter(id => !deleted.has(id))));
      this.closeDeleteModal();
      this.api.reloadPool();
    }).catch(() => {
      this.deleteStatus.set('error');
    });
  }
}

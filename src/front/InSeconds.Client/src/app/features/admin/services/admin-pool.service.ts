import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SettingsService } from '../../../core/services/settings.service';
import { AdminApiService } from './admin-api.service';
import { PoolAudioPreviewService } from './pool-audio-preview.service';
import { DeezerTrackInfo, PoolTrackDto } from '../admin.models';

type PoolTrackWithFlag = PoolTrackDto & { isAvailable: boolean };
export type PoolSortColumn = 'artist' | 'title' | 'preview' | 'status' | 'lastUsedDate' | 'unlockDate' | 'usageCount';
type PoolFilterStatus = 'all' | 'available' | 'used';
type PoolFilterPreview = 'all' | 'ok' | 'missing';

/** État de l'onglet pool : filtres, pagination, sélection, panneau de recherche/ajout, modale suppression. */
@Injectable()
export class AdminPoolService {
  private readonly api = inject(AdminApiService);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly audioPreview = inject(PoolAudioPreviewService);

  readonly poolTracks = this.api.poolTracks;
  readonly poolTracksLoading = this.api.poolTracksLoading;
  readonly poolSearchResults = this.api.poolSearchResults;
  readonly poolSearchLoading = this.api.poolSearchLoading;
  readonly poolSearchQuery = this.api.poolSearchQuery;

  readonly poolPageSize = 15;
  readonly allTracksPage = signal(0);
  readonly poolFilterText = signal('');
  readonly poolFilterStatus = signal<PoolFilterStatus>('all');
  readonly poolFilterPreview = signal<PoolFilterPreview>('all');
  readonly poolFilterLastUsedFrom = signal<string>(''); // ISO yyyy-MM-dd, '' = pas de borne basse
  readonly poolFilterLastUsedTo = signal<string>('');   // ISO yyyy-MM-dd, '' = pas de borne haute

  readonly poolSortColumn = signal<PoolSortColumn | null>(null);
  readonly poolSortDirection = signal<'asc' | 'desc'>('asc');

  readonly selectedTrackIds = signal<Set<number>>(new Set());

  // --- panneau de recherche/ajout (bandeau intégré, remplace l'ancienne modale) ---
  // Par ligne de résultat (deezerTrackId → statut) — plusieurs ajouts peuvent être lancés
  // à la suite sans attendre la réponse du précédent, chaque ligne doit refléter son propre état.
  private readonly addTrackStatuses = signal<ReadonlyMap<number, 'loading' | 'success' | 'error'>>(new Map());
  private readonly addTrackStatusTimers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly addPanelOpen = signal(false);
  readonly previewingUrl = signal<string | null>(null);
  // Indépendantes par défaut ; liées, la saisie dans l'un des deux champs (filtre pool /
  // recherche Deezer) met à jour l'autre. Les deux champs restent affichés en permanence
  // dans les deux états — seule la propagation de valeur change (cf. admin/CLAUDE.md).
  readonly searchLinked = signal(false);

  // --- modale écoute (preview d'une ligne du pool) ---
  // Le lecteur audio (play/pause/progress) vit dans PoolAudioPreviewService, partagé
  // entre cette modale et le panneau de recherche/ajout (une seule instance Audio() active à la fois).
  readonly previewModalOpen = signal(false);
  readonly previewModalTrack = signal<PoolTrackDto | null>(null);
  readonly previewModalStatus = signal<'loading' | 'ready' | 'error'>('loading');
  readonly previewModalUrl = signal<string | null>(null);

  // --- modale suppression ---
  readonly deleteModalOpen = signal(false);
  readonly deleteModalTracks = signal<PoolTrackDto[]>([]);
  readonly deleteStatus = signal<'idle' | 'loading' | 'error'>('idle');

  // --- modale modification (artiste / titre) ---
  readonly editModalTrack = signal<PoolTrackDto | null>(null);
  readonly editArtist = signal('');
  readonly editTitle = signal('');
  readonly editStatus = signal<'idle' | 'loading' | 'error' | 'todayChallenge'>('idle');
  /** Désactive « Enregistrer » : champ vide, rien de changé, ou envoi en cours. */
  readonly editSaveDisabled = computed(() => {
    const track = this.editModalTrack();
    const artist = this.editArtist().trim();
    const title = this.editTitle().trim();
    return !track || !artist || !title || this.editStatus() === 'loading'
      || (artist === track.artist && title === track.title);
  });

  readonly allTracks = computed(() => {
    const available = this.poolTracks().available.map(t => ({ ...t, isAvailable: true }));
    const used = this.poolTracks().used.map(t => ({ ...t, isAvailable: false }));
    return [...available, ...used];
  });

  readonly filteredTracks = computed(() => {
    const text = this.poolFilterText().toLowerCase().trim();
    const status = this.poolFilterStatus();
    const preview = this.poolFilterPreview();
    const from = this.poolFilterLastUsedFrom();
    const to = this.poolFilterLastUsedTo();
    return this.allTracks().filter(t =>
      this.matchesText(t, text) &&
      this.matchesStatus(t, status) &&
      this.matchesPreview(t, preview) &&
      this.matchesLastUsedRange(t, from, to)
    );
  });

  // Teste le texte contre artiste et titre séparément, mais aussi combinés
  // ("Artiste Titre") — la recherche Deezer liée (cf. searchLinked) tape
  // typiquement les deux ensemble ("Nicki Minaj Starships"), ce qui ne matche
  // ni l'artiste seul ni le titre seul et faisait disparaître un morceau
  // pourtant bien présent dans le pool.
  private matchesText(t: PoolTrackWithFlag, text: string): boolean {
    if (!text) return true;
    const artist = t.artist.toLowerCase();
    const title = t.title.toLowerCase();
    return artist.includes(text) || title.includes(text) || `${artist} ${title}`.includes(text);
  }

  private matchesStatus(t: PoolTrackWithFlag, status: PoolFilterStatus): boolean {
    if (status === 'available') return t.isAvailable;
    if (status === 'used') return !t.isAvailable;
    return true;
  }

  private matchesPreview(t: PoolTrackWithFlag, preview: PoolFilterPreview): boolean {
    if (preview === 'ok') return t.hasPreview === true;
    if (preview === 'missing') return t.hasPreview === false;
    return true;
  }

  private matchesLastUsedRange(t: PoolTrackWithFlag, from: string, to: string): boolean {
    if (from && (!t.lastUsedDate || t.lastUsedDate.localeCompare(from) < 0)) return false;
    if (to && (!t.lastUsedDate || t.lastUsedDate.localeCompare(to) > 0)) return false;
    return true;
  }

  readonly sortedTracks = computed(() => {
    const column = this.poolSortColumn();
    const dir = this.poolSortDirection() === 'asc' ? 1 : -1;
    const list = [...this.filteredTracks()];
    if (!column) return list;
    list.sort((a, b) => {
      const va = this.sortValue(a, column);
      const vb = this.sortValue(b, column);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // null/vide toujours en dernier, quelle que soit la direction
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
    return list;
  });

  private sortValue(t: PoolTrackWithFlag, column: PoolSortColumn): string | number | null {
    switch (column) {
      case 'artist': return t.artist.toLowerCase();
      case 'title': return t.title.toLowerCase();
      case 'preview': {
        if (t.hasPreview === true) return 2;
        if (t.hasPreview === false) return 0;
        return 1;
      }
      case 'status': return t.isAvailable ? 1 : 0;
      case 'lastUsedDate': return t.lastUsedDate ?? null;
      case 'unlockDate': return t.unlockDate ?? null;
      case 'usageCount': return t.usageCount ?? 0;
    }
  }

  // Détection de doublon dans le panneau de recherche Deezer : DeezerTrackId exact,
  // disponible ou utilisé (peu importe où le morceau vit dans le pool). La valeur associée
  // distingue les deux cas pour que le badge affiché à l'admin soit sans ambiguïté — un
  // morceau "utilisé" (déjà servi dans un ancien défi) n'apparaît pas dans la vue "Disponible"
  // du tableau Pool, ce qui pouvait donner l'impression d'un faux positif si le badge ne le
  // précisait pas.
  readonly existingDeezerTrackIds = computed(() => {
    const map = new Map<number, boolean>();
    for (const t of this.allTracks()) map.set(t.deezerTrackId, t.isAvailable);
    return map;
  });

  // Autonomie du pool : mêmes critères que DailyChallengeGenerator côté back
  // (jamais utilisé + preview active), calculée depuis les données déjà chargées
  // — pas d'appel serveur supplémentaire.
  readonly poolAvailableWithPreview = computed(() =>
    this.poolTracks().available.filter(t => t.hasPreview !== false).length);

  readonly poolDaysRemaining = computed(() =>
    Math.floor(this.poolAvailableWithPreview() / Math.max(1, this.settings.tracksPerChallenge())));

  poolDaysColor(days: number): string {
    if (days < 3) return 'var(--color-fail)';
    if (days < 7) return 'var(--bg-warn)';
    return 'var(--color-success)';
  }

  readonly allTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTracks().length / this.poolPageSize)));

  readonly pagedAllTracks = computed(() => {
    const page = this.allTracksPage();
    return this.sortedTracks().slice(page * this.poolPageSize, (page + 1) * this.poolPageSize);
  });

  // --- filtres ---
  setPoolFilter(text: string): void {
    this.poolFilterText.set(text);
    this.allTracksPage.set(0);
    if (this.searchLinked()) this.poolSearchQuery.set(text);
  }
  setPoolFilterStatus(v: PoolFilterStatus): void { this.poolFilterStatus.set(v); this.allTracksPage.set(0); }
  setPoolFilterPreview(v: PoolFilterPreview): void { this.poolFilterPreview.set(v); this.allTracksPage.set(0); }
  setPoolFilterLastUsedFrom(v: string): void { this.poolFilterLastUsedFrom.set(v); this.allTracksPage.set(0); }
  setPoolFilterLastUsedTo(v: string): void { this.poolFilterLastUsedTo.set(v); this.allTracksPage.set(0); }

  // --- tri ---
  setPoolSort(column: PoolSortColumn): void {
    if (this.poolSortColumn() === column) {
      this.poolSortDirection.set(this.poolSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.poolSortColumn.set(column);
      this.poolSortDirection.set('asc');
    }
  }

  onPoolSearchChange(q: string): void {
    this.poolSearchQuery.set(q);
    this.allTracksPage.set(0);
    if (this.searchLinked()) this.poolFilterText.set(q);
  }

  toggleSearchLink(): void {
    const linked = !this.searchLinked();
    this.searchLinked.set(linked);
    if (linked) this.poolSearchQuery.set(this.poolFilterText());
  }

  // --- sélection ---
  toggleSelection(id: number): void {
    const set = new Set(this.selectedTrackIds());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.selectedTrackIds.set(set);
  }

  clearSelection(): void { this.selectedTrackIds.set(new Set()); }

  /** Un morceau déjà utilisé dans un défi ne peut pas être supprimé (le back renvoie 409). */
  readonly selectionHasUsedTrack = computed(() => {
    const selected = this.selectedTrackIds();
    return this.poolTracks().used.some(t => selected.has(t.id));
  });

  // --- panneau de recherche/ajout ---
  toggleAddPanel(): void {
    const open = !this.addPanelOpen();
    this.addPanelOpen.set(open);
    if (!open) {
      this.audioPreview.stop();
      this.previewingUrl.set(null);
      this.poolSearchQuery.set('');
      for (const timer of this.addTrackStatusTimers.values()) clearTimeout(timer);
      this.addTrackStatusTimers.clear();
      this.addTrackStatuses.set(new Map());
    }
  }

  /** Statut d'ajout de cette ligne de résultat précise ('idle' si jamais tentée). */
  addTrackStatus(deezerTrackId: number): 'idle' | 'loading' | 'success' | 'error' {
    return this.addTrackStatuses().get(deezerTrackId) ?? 'idle';
  }

  previewSearchResult(url: string | null | undefined): void {
    if (!url) return;
    this.previewingUrl.set(url);
    this.audioPreview.toggle(url);
  }

  // --- modale écoute ---
  openPreviewModal(t: PoolTrackDto): void {
    this.audioPreview.stop();
    this.previewModalTrack.set(t);
    this.previewModalUrl.set(null);
    this.previewModalStatus.set('loading');
    this.previewModalOpen.set(true);

    // Réutilise la recherche Deezer admin pour retrouver l'URL de preview de ce morceau.
    this.api.searchDeezer(`${t.artist} ${t.title}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          const match = results.find(r => r.deezerTrackId === t.deezerTrackId) ?? results[0];
          if (match?.previewUrl) {
            this.previewModalUrl.set(match.previewUrl);
            this.previewModalStatus.set('ready');
            this.audioPreview.toggle(match.previewUrl); // démarre la lecture directement
          } else {
            this.previewModalStatus.set('error');
          }
        },
        error: () => this.previewModalStatus.set('error'),
      });
  }

  closePreviewModal(): void {
    this.audioPreview.stop();
    this.previewModalOpen.set(false);
    this.previewModalTrack.set(null);
    this.previewModalUrl.set(null);
    this.previewModalStatus.set('loading');
  }

  addTrackFromPanel(track: DeezerTrackInfo): void {
    const deezerTrackId = track.deezerTrackId;
    this.setAddTrackStatus(deezerTrackId, 'loading');

    this.api.addTrack(deezerTrackId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.setAddTrackStatus(deezerTrackId, 'success');
        this.api.reloadPool();
        this.scheduleAddTrackStatusReset(deezerTrackId, 'success', 2000);
      },
      error: () => {
        this.setAddTrackStatus(deezerTrackId, 'error');
        this.scheduleAddTrackStatusReset(deezerTrackId, 'error', 3000);
      },
    });
  }

  private setAddTrackStatus(deezerTrackId: number, status: 'loading' | 'success' | 'error'): void {
    const next = new Map(this.addTrackStatuses());
    next.set(deezerTrackId, status);
    this.addTrackStatuses.set(next);
  }

  private scheduleAddTrackStatusReset(deezerTrackId: number, expected: 'success' | 'error', delayMs: number): void {
    const existingTimer = this.addTrackStatusTimers.get(deezerTrackId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      if (this.addTrackStatus(deezerTrackId) === expected) {
        const next = new Map(this.addTrackStatuses());
        next.delete(deezerTrackId);
        this.addTrackStatuses.set(next);
      }
      this.addTrackStatusTimers.delete(deezerTrackId);
    }, delayMs);
    this.addTrackStatusTimers.set(deezerTrackId, timer);
  }

  // --- modale modification ---
  openEditModal(track: PoolTrackDto): void {
    if (track.inTodayChallenge) return;
    this.editModalTrack.set(track);
    this.editArtist.set(track.artist);
    this.editTitle.set(track.title);
    this.editStatus.set('idle');
  }

  closeEditModal(): void {
    this.editModalTrack.set(null);
    this.editStatus.set('idle');
  }

  confirmEdit(): void {
    const track = this.editModalTrack();
    if (!track || this.editSaveDisabled()) return;
    this.editStatus.set('loading');
    this.api.renameTrack(track.id, this.editArtist().trim(), this.editTitle().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeEditModal();
          this.api.reloadPool();
        },
        // 409 = morceau passé dans le défi du jour entre-temps.
        error: err => this.editStatus.set(err?.status === 409 ? 'todayChallenge' : 'error'),
      });
  }

  // --- modale suppression ---
  openDeleteModal(track: PoolTrackDto | null): void {
    if (track) {
      this.deleteModalTracks.set([track]);
    } else {
      // Garde-fou : le bouton est désactivé si la sélection contient un morceau utilisé.
      if (this.selectionHasUsedTrack()) return;
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
      this.allTracksPage.set(0);
      this.api.reloadPool();
    }).catch(() => {
      this.deleteStatus.set('error');
    });
  }
}

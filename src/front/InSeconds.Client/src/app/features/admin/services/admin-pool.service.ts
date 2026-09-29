import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../../core/services/settings.service';
import { AdminApiService } from './admin-api.service';
import { PoolAudioPreviewService } from './pool-audio-preview.service';
import { DeezerTrackInfo, PoolTrackDto } from '../admin.models';

type PoolTrackWithFlag = PoolTrackDto & { isAvailable: boolean };
export type PoolSortColumn = 'artist' | 'title' | 'preview' | 'status' | 'lastUsedDate' | 'unlockDate' | 'usageCount';
type PoolFilterStatus = 'all' | 'available' | 'used' | 'disabled';
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
  private readonly _allTracksPage = signal(0);
  readonly allTracksPage = this._allTracksPage.asReadonly();
  private readonly _poolFilterText = signal('');
  readonly poolFilterText = this._poolFilterText.asReadonly();
  private readonly _poolFilterStatus = signal<PoolFilterStatus>('all');
  readonly poolFilterStatus = this._poolFilterStatus.asReadonly();
  private readonly _poolFilterPreview = signal<PoolFilterPreview>('all');
  readonly poolFilterPreview = this._poolFilterPreview.asReadonly();
  private readonly _poolFilterLastUsedFrom = signal<string>(''); // ISO yyyy-MM-dd, '' = pas de borne basse
  readonly poolFilterLastUsedFrom = this._poolFilterLastUsedFrom.asReadonly();
  private readonly _poolFilterLastUsedTo = signal<string>(''); // ISO yyyy-MM-dd, '' = pas de borne haute
  readonly poolFilterLastUsedTo = this._poolFilterLastUsedTo.asReadonly();

  private readonly _poolSortColumn = signal<PoolSortColumn | null>(null);
  readonly poolSortColumn = this._poolSortColumn.asReadonly();
  private readonly _poolSortDirection = signal<'asc' | 'desc'>('asc');
  readonly poolSortDirection = this._poolSortDirection.asReadonly();

  private readonly _selectedTrackIds = signal<Set<number>>(new Set());
  readonly selectedTrackIds = this._selectedTrackIds.asReadonly();

  // --- désactivation (morceaux utilisés, à la place de la suppression) ---
  // Ids en cours d'envoi (bouton désactivé le temps de la requête) + erreur affichée dans la barre d'outils.
  private readonly _togglingDisabledIds = signal<ReadonlySet<number>>(new Set());
  readonly togglingDisabledIds = this._togglingDisabledIds.asReadonly();
  private readonly _toggleDisabledError = signal<'error' | 'inToday' | null>(null);
  readonly toggleDisabledError = this._toggleDisabledError.asReadonly();
  private toggleDisabledErrorTimer: ReturnType<typeof setTimeout> | null = null;

  // --- panneau de recherche/ajout (bandeau intégré, remplace l'ancienne modale) ---
  // Par ligne de résultat (deezerTrackId → statut) — plusieurs ajouts peuvent être lancés
  // à la suite sans attendre la réponse du précédent, chaque ligne doit refléter son propre état.
  private readonly addTrackStatuses = signal<ReadonlyMap<number, 'loading' | 'success' | 'error'>>(new Map());
  private readonly addTrackStatusTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _addPanelOpen = signal(false);
  readonly addPanelOpen = this._addPanelOpen.asReadonly();
  private readonly _previewingUrl = signal<string | null>(null);
  readonly previewingUrl = this._previewingUrl.asReadonly();
  // Indépendantes par défaut ; liées, la saisie dans l'un des deux champs (filtre pool /
  // recherche Deezer) met à jour l'autre. Les deux champs restent affichés en permanence
  // dans les deux états — seule la propagation de valeur change (cf. admin/CLAUDE.md).
  private readonly _searchLinked = signal(false);
  readonly searchLinked = this._searchLinked.asReadonly();

  // --- modale écoute (preview d'une ligne du pool) ---
  // Le lecteur audio (play/pause/progress) vit dans PoolAudioPreviewService, partagé
  // entre cette modale et le panneau de recherche/ajout (une seule instance Audio() active à la fois).
  private readonly _previewModalOpen = signal(false);
  readonly previewModalOpen = this._previewModalOpen.asReadonly();
  private readonly _previewModalTrack = signal<PoolTrackDto | null>(null);
  readonly previewModalTrack = this._previewModalTrack.asReadonly();
  private readonly _previewModalStatus = signal<'loading' | 'ready' | 'error'>('loading');
  readonly previewModalStatus = this._previewModalStatus.asReadonly();
  private readonly _previewModalUrl = signal<string | null>(null);
  readonly previewModalUrl = this._previewModalUrl.asReadonly();

  // --- modale suppression ---
  private readonly _deleteModalOpen = signal(false);
  readonly deleteModalOpen = this._deleteModalOpen.asReadonly();
  private readonly _deleteModalTracks = signal<PoolTrackDto[]>([]);
  readonly deleteModalTracks = this._deleteModalTracks.asReadonly();
  private readonly _deleteStatus = signal<'idle' | 'loading' | 'error'>('idle');
  readonly deleteStatus = this._deleteStatus.asReadonly();

  // --- modale modification (artiste / titre) ---
  private readonly _editModalTrack = signal<PoolTrackDto | null>(null);
  readonly editModalTrack = this._editModalTrack.asReadonly();
  private readonly _editArtist = signal('');
  readonly editArtist = this._editArtist.asReadonly();
  private readonly _editTitle = signal('');
  readonly editTitle = this._editTitle.asReadonly();
  private readonly _editStatus = signal<'idle' | 'loading' | 'error' | 'locked'>('idle');
  readonly editStatus = this._editStatus.asReadonly();
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
    if (status === 'disabled') return t.isDisabled === true;
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
    // Les morceaux désactivés vont toujours en fin de liste, quel que soit le tri choisi
    // (Array.sort est stable : l'ordre d'origine est conservé à l'intérieur de chaque groupe).
    const byDisabled = (a: PoolTrackWithFlag, b: PoolTrackWithFlag) => Number(!!a.isDisabled) - Number(!!b.isDisabled);
    if (!column) return list.sort(byDisabled);
    list.sort((a, b) => {
      const disabledOrder = byDisabled(a, b);
      if (disabledOrder !== 0) return disabledOrder;
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

  // Autonomie du pool : jamais utilisé + preview active + non désactivé (DailyChallengeGenerator
  // exclut aussi les désactivés), calculée depuis les données déjà chargées
  // — pas d'appel serveur supplémentaire.
  readonly poolAvailableWithPreview = computed(() =>
    this.poolTracks().available.filter(t => t.hasPreview !== false && !t.isDisabled).length);

  readonly disabledCount = computed(() => this.allTracks().filter(t => t.isDisabled).length);

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

  // --- pagination ---
  previousPage(): void { this._allTracksPage.update(p => Math.max(0, p - 1)); }
  nextPage(): void { this._allTracksPage.update(p => Math.min(this.allTotalPages() - 1, p + 1)); }

  // --- filtres ---
  setPoolFilter(text: string): void {
    this._poolFilterText.set(text);
    this._allTracksPage.set(0);
    if (this.searchLinked()) this.api.setPoolSearchQuery(text);
  }
  setPoolFilterStatus(v: PoolFilterStatus): void { this._poolFilterStatus.set(v); this._allTracksPage.set(0); }
  setPoolFilterPreview(v: PoolFilterPreview): void { this._poolFilterPreview.set(v); this._allTracksPage.set(0); }
  setPoolFilterLastUsedFrom(v: string): void { this._poolFilterLastUsedFrom.set(v); this._allTracksPage.set(0); }
  setPoolFilterLastUsedTo(v: string): void { this._poolFilterLastUsedTo.set(v); this._allTracksPage.set(0); }

  // --- tri ---
  setPoolSort(column: PoolSortColumn): void {
    if (this.poolSortColumn() === column) {
      this._poolSortDirection.set(this.poolSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this._poolSortColumn.set(column);
      this._poolSortDirection.set('asc');
    }
  }

  onPoolSearchChange(q: string): void {
    this.api.setPoolSearchQuery(q);
    this._allTracksPage.set(0);
    if (this.searchLinked()) this._poolFilterText.set(q);
  }

  toggleSearchLink(): void {
    const linked = !this.searchLinked();
    this._searchLinked.set(linked);
    if (linked) this.api.setPoolSearchQuery(this.poolFilterText());
  }

  // --- sélection ---
  toggleSelection(id: number): void {
    const set = new Set(this.selectedTrackIds());
    if (set.has(id)) set.delete(id); else set.add(id);
    this._selectedTrackIds.set(set);
  }

  clearSelection(): void { this._selectedTrackIds.set(new Set()); }

  /** Un morceau déjà utilisé dans un défi ne peut pas être supprimé (le back renvoie 409). */
  readonly selectionHasUsedTrack = computed(() => {
    const selected = this.selectedTrackIds();
    return this.poolTracks().used.some(t => selected.has(t.id));
  });

  // --- panneau de recherche/ajout ---
  toggleAddPanel(): void {
    const open = !this.addPanelOpen();
    this._addPanelOpen.set(open);
    if (!open) {
      this.audioPreview.stop();
      this._previewingUrl.set(null);
      this.api.setPoolSearchQuery('');
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
    this._previewingUrl.set(url);
    this.audioPreview.toggle(url);
  }

  // --- modale écoute ---
  // M14 (revue du 25/09) : takeUntilDestroyed(this.destroyRef) ne protège pas ici — ce
  // destroyRef est celui du service (scopé à AdminComponent, cf. CLAUDE.md admin), pas de la
  // modale, donc une réponse Deezer tardive après fermeture appelait quand même
  // audioPreview.toggle(...) et redémarrait la lecture (ou écrasait l'état d'une modale
  // rouverte entre-temps sur un autre morceau). La souscription est désormais gardée à la
  // main et annulée explicitement à chaque nouvelle ouverture et à la fermeture.
  private previewSearchSubscription: Subscription | null = null;

  openPreviewModal(t: PoolTrackDto): void {
    this.previewSearchSubscription?.unsubscribe();
    this.audioPreview.stop();
    this._previewModalTrack.set(t);
    this._previewModalUrl.set(null);
    this._previewModalStatus.set('loading');
    this._previewModalOpen.set(true);

    // Réutilise la recherche Deezer admin pour retrouver l'URL de preview de ce morceau.
    this.previewSearchSubscription = this.api.searchDeezer(`${t.artist} ${t.title}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          const match = results.find(r => r.deezerTrackId === t.deezerTrackId) ?? results[0];
          if (match?.previewUrl) {
            this._previewModalUrl.set(match.previewUrl);
            this._previewModalStatus.set('ready');
            this.audioPreview.toggle(match.previewUrl); // démarre la lecture directement
          } else {
            this._previewModalStatus.set('error');
          }
        },
        error: () => this._previewModalStatus.set('error'),
      });
  }

  closePreviewModal(): void {
    this.previewSearchSubscription?.unsubscribe();
    this.audioPreview.stop();
    this._previewModalOpen.set(false);
    this._previewModalTrack.set(null);
    this._previewModalUrl.set(null);
    this._previewModalStatus.set('loading');
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
    if (track.renameLocked) return;
    this._editModalTrack.set(track);
    this._editArtist.set(track.artist);
    this._editTitle.set(track.title);
    this._editStatus.set('idle');
  }

  setEditArtist(value: string): void { this._editArtist.set(value); }
  setEditTitle(value: string): void { this._editTitle.set(value); }

  closeEditModal(): void {
    this._editModalTrack.set(null);
    this._editStatus.set('idle');
  }

  confirmEdit(): void {
    const track = this.editModalTrack();
    if (!track || this.editSaveDisabled()) return;
    this._editStatus.set('loading');
    this.api.renameTrack(track.id, this.editArtist().trim(), this.editTitle().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeEditModal();
          this.api.reloadPool();
        },
        // 409 = morceau entré entre-temps dans une partie en cours (défi du jour).
        error: err => this._editStatus.set(err?.status === 409 ? 'locked' : 'error'),
      });
  }

  // --- désactivation ---
  /** Retire le morceau du tirage des prochains défis, ou l'y remet. Refusé (409) pour un morceau du défi du jour. */
  toggleDisabled(track: PoolTrackDto): void {
    const disable = !track.isDisabled;
    if (this.togglingDisabledIds().has(track.id) || (disable && track.inTodayChallenge)) return;
    this.setToggling(track.id, true);
    this.api.setTrackDisabled(track.id, disable)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setToggling(track.id, false);
          this.api.reloadPool();
        },
        error: err => {
          this.setToggling(track.id, false);
          this.showToggleDisabledError(err?.status === 409 ? 'inToday' : 'error');
        },
      });
  }

  private setToggling(id: number, on: boolean): void {
    const next = new Set(this.togglingDisabledIds());
    if (on) next.add(id); else next.delete(id);
    this._togglingDisabledIds.set(next);
  }

  private showToggleDisabledError(kind: 'error' | 'inToday'): void {
    if (this.toggleDisabledErrorTimer) clearTimeout(this.toggleDisabledErrorTimer);
    this._toggleDisabledError.set(kind);
    this.toggleDisabledErrorTimer = setTimeout(() => this._toggleDisabledError.set(null), 4000);
  }

  // --- modale suppression ---
  openDeleteModal(track: PoolTrackDto | null): void {
    if (track) {
      this._deleteModalTracks.set([track]);
    } else {
      // Garde-fou : le bouton est désactivé si la sélection contient un morceau utilisé.
      if (this.selectionHasUsedTrack()) return;
      const available = this.poolTracks().available;
      this._deleteModalTracks.set(available.filter(t => this.selectedTrackIds().has(t.id)));
    }
    this._deleteStatus.set('idle');
    this._deleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    this._deleteModalOpen.set(false);
    this._deleteModalTracks.set([]);
    this._deleteStatus.set('idle');
  }

  confirmDelete(): void {
    const tracks = this.deleteModalTracks();
    if (tracks.length === 0) return;
    this._deleteStatus.set('loading');

    const requests = tracks.map(t =>
      new Promise<number>((resolve, reject) => {
        this.api.deleteTrack(t.id).subscribe({ next: () => resolve(t.id), error: reject });
      })
    );

    Promise.all(requests).then(() => {
      const deleted = new Set(tracks.map(t => t.id));
      this._selectedTrackIds.set(new Set([...this.selectedTrackIds()].filter(id => !deleted.has(id))));
      this.closeDeleteModal();
      this._allTracksPage.set(0);
      this.api.reloadPool();
    }).catch(() => {
      this._deleteStatus.set('error');
    });
  }
}

import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { ModalService } from '../../ui/modal/modal.service';
import { AudioPreviewPlayer } from '../data-access/audio-preview.player';
import { DeezerSearchStore } from '../data-access/deezer-search.store';
import { PoolStore } from '../data-access/pool.store';
import { DeezerResult, PoolTrack } from '../domain/pool-track';
import { PoolFilterBarComponent } from '../ui/pool-filter-bar.component';
import { PoolTableComponent } from '../ui/pool-table.component';
import { PoolToolbarComponent } from '../ui/pool-toolbar.component';
import { SearchPanelComponent } from '../ui/search-panel.component';
import { DeleteTrackDialog } from './delete-track.dialog';
import { EditTrackDialog } from './edit-track.dialog';
import { PreviewTrackDialog } from './preview-track.dialog';

const TOGGLE_ERROR_VISIBLE_MS = 4000;
const DIALOG_MAX_WIDTH = '26rem';

/**
 * `/admin/catalogue` : le pool de morceaux. Tableau filtrable, triable et paginé, panneau de
 * recherche Deezer pour ajouter, fenêtres d'écoute, de renommage et de suppression. La page de la
 * grille vit dans l'adresse (`?page=3`, à partir de 1) : un rechargement rouvre la même page.
 */
@Component({
  selector: 'app-catalogue-page',
  imports: [
    TranslatePipe, ErrorMessageComponent, PoolToolbarComponent, PoolFilterBarComponent, PoolTableComponent,
    SearchPanelComponent,
  ],
  providers: [PoolStore, DeezerSearchStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 w-full max-w-2xl">
      <app-pool-toolbar
        [selectedCount]="pool.selectedIds().length"
        [selectionHasUsedTrack]="pool.selectionHasUsedTrack()"
        [availableCount]="pool.availableCount()"
        [usedCount]="pool.usedCount()"
        [disabledCount]="pool.disabledCount()"
        [runwayDays]="pool.runwayDays()"
        [runwayTone]="pool.runwayTone()"
        [addPanelOpen]="search.open()"
        (deselectAll)="pool.clearSelection()"
        (deleteSelection)="deleteSelection()"
        (toggleAdd)="togglePanel()" />

      @if (search.open()) {
        <app-search-panel
          [query]="search.query()"
          [results]="search.results()"
          [searching]="search.searching()"
          [errorKey]="searchErrorKey()"
          [linked]="search.linked()"
          [existing]="pool.existingDeezerIds()"
          [addStatuses]="search.addStatuses()"
          [addErrorKeys]="addErrorKeys()"
          [previewingUrl]="player.url()"
          [playing]="player.playing()"
          [progress]="player.progress()"
          (queryChange)="onSearchQuery($event)"
          (toggleLink)="toggleLink()"
          (preview)="previewResult($event)"
          (add)="search.add($event.deezerTrackId)" />
      }

      <app-pool-filter-bar
        [filters]="pool.filters()"
        (textChange)="onFilterText($event)"
        (previewChange)="pool.setPreview($event)"
        (statusChange)="pool.setStatus($event)"
        (lastUsedFromChange)="pool.setLastUsedFrom($event)"
        (lastUsedToChange)="pool.setLastUsedTo($event)"
        (reset)="pool.resetFilters()" />

      @if (pool.toggleError(); as kind) {
        <p class="text-xs" role="alert" style="color:var(--color-fail)">
          {{ (kind === 'inToday' ? 'admin.pool.disableInTodayError' : 'admin.pool.disableError') | translate }}
        </p>
      }

      @if (pool.error(); as error) {
        <app-error-message [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      <!-- Un chargement en échec n'est pas un pool vide : l'erreur est affichée au-dessus, sans « aucun morceau ». -->
      @if (!pool.error() || pool.tracks().length > 0) {
      <app-pool-table
        [tracks]="pool.pageTracks()"
        [selectedIds]="pool.selectedIds()"
        [togglingIds]="pool.togglingIds()"
        [sort]="pool.sort()"
        [page]="pool.page()"
        [pages]="pool.pages()"
        [filteredCount]="pool.filtered().length"
        [totalCount]="pool.tracks().length"
        [loading]="pool.isPending() && pool.tracks().length === 0"
        (sortBy)="pool.sortBy($event)"
        (toggleSelection)="pool.toggleSelection($event)"
        (listen)="listen($event)"
        (edit)="edit($event)"
        (toggleDisabled)="pool.toggleDisabled($event)"
        (delete)="deleteTracks([$event])"
        (previousPage)="pool.previousPage()"
        (nextPage)="pool.nextPage()" />
      }
    </div>
  `,
})
export class CataloguePage {
  protected readonly pool = inject(PoolStore);
  protected readonly search = inject(DeezerSearchStore);
  protected readonly player = inject(AudioPreviewPlayer);
  protected readonly errorMessageKey = errorMessageKey;
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly searchErrorKey = computed(() => {
    const error = this.search.searchError();
    return error ? errorMessageKey(error.code) : null;
  });
  protected readonly addErrorKeys = computed(() => Object.fromEntries(
    Object.entries(this.search.addErrors()).map(([id, error]) => [id, errorMessageKey(error.code)]),
  ));

  constructor() {
    // La page de la grille vit dans l'adresse (`?page=3`, numérotée à partir de 1) : un rechargement
    // ou un lien partagé rouvre la même page.
    const page = Number(this.route.snapshot.queryParamMap.get('page'));
    if (Number.isInteger(page) && page >= 1) this.pool.goToPage(page - 1);

    // Page → adresse, seulement une fois le pool chargé (avant, la grille n'a qu'une page et celle de
    // l'adresse serait effacée). `replaceUrl` : « précédent » ne revient pas page par page.
    effect(() => {
      if (!this.pool.isFulfilled()) return;
      const current = this.pool.page() + 1;
      untracked(() => void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: current > 1 ? current : null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }));
    });

    // L'erreur d'une désactivation s'efface seule.
    effect(onCleanup => {
      if (!this.pool.toggleError()) return;
      const timer = setTimeout(() => this.pool.dismissToggleError(), TOGGLE_ERROR_VISIBLE_MS);
      onCleanup(() => clearTimeout(timer));
    });

    void this.pool.load();
  }

  // --- panneau de recherche : liaison avec le filtre du tableau ---

  protected togglePanel(): void {
    this.search.toggleOpen();
    if (!this.search.open()) this.player.stop();
    // Rouvert en étant lié : la recherche reprend le texte du filtre (elle a été vidée à la fermeture).
    else if (this.search.linked()) this.search.setQuery(this.pool.filters().text);
  }

  /**
   * Liées, taper dans l'un des deux champs met à jour l'autre ; indépendantes, rien ne se propage.
   * Panneau fermé, rien n'est recherché chez Deezer (il reprendra le filtre à sa réouverture).
   */
  protected onFilterText(text: string): void {
    this.pool.setText(text);
    if (this.search.linked() && this.search.open()) this.search.setQuery(text);
  }

  protected onSearchQuery(query: string): void {
    this.search.setQuery(query);
    if (this.search.linked()) this.pool.setText(query);
  }

  protected toggleLink(): void {
    this.search.toggleLinked();
    if (this.search.linked()) this.search.setQuery(this.pool.filters().text);
  }

  protected previewResult(result: DeezerResult): void {
    this.player.toggle(result.previewUrl);
  }

  // --- fenêtres ---

  protected listen(track: PoolTrack): void {
    this.modal.open(PreviewTrackDialog, { data: track, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }

  protected edit(track: PoolTrack): void {
    this.modal.open(EditTrackDialog, { data: track, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }

  protected deleteTracks(tracks: readonly PoolTrack[]): void {
    this.modal.open(DeleteTrackDialog, { data: tracks, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }

  protected deleteSelection(): void {
    // Garde-fou : le bouton est désactivé si la sélection contient un morceau utilisé.
    if (this.pool.selectionHasUsedTrack()) return;
    const tracks = this.pool.selectedTracks();
    if (tracks.length > 0) this.deleteTracks(tracks);
  }
}

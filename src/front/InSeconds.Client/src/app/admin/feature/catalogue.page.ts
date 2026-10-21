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
import { MODE_VIEWS, POOL_VIEW } from '../domain/pool-views';
import { PoolFilterBarComponent } from '../ui/pool-filter-bar.component';
import { PoolTableComponent } from '../ui/pool-table.component';
import { PoolToolbarComponent } from '../ui/pool-toolbar.component';
import { PoolViewSelectorComponent } from '../ui/pool-view-selector.component';
import { SearchPanelComponent } from '../ui/search-panel.component';
import { DeleteTrackDialog } from './delete-track.dialog';
import { EditTrackDialog } from './edit-track.dialog';
import { PreviewTrackDialog } from './preview-track.dialog';

const TOGGLE_ERROR_VISIBLE_MS = 4000;
const DIALOG_MAX_WIDTH = '26rem';

/**
 * `/admin/catalogue` : le pool de morceaux, commun à tous les modes. Un sélecteur donne le pool général (tableau
 * filtrable, triable et paginé, panneau de recherche Deezer pour ajouter, fenêtres d'écoute, de renommage et de
 * suppression) ou la vue d'un mode, en lecture seule (écouter, retrouver le morceau dans le pool). La vue (`?view=daily`,
 * absente pour le pool général) et la page de la grille (`?page=3`, à partir de 1) vivent dans l'adresse : un
 * rechargement ou un lien partagé rouvre la même vue et la même page.
 */
@Component({
  selector: 'app-catalogue-page',
  imports: [
    TranslatePipe, ErrorMessageComponent, PoolToolbarComponent, PoolFilterBarComponent, PoolTableComponent,
    SearchPanelComponent, PoolViewSelectorComponent,
  ],
  providers: [PoolStore, DeezerSearchStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Pleine largeur : centrée par la coquille (`items-center`), la page prendrait sinon la largeur du
  // tableau et déborderait de l'écran du téléphone au lieu de faire défiler le tableau seul.
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <div class="flex flex-col gap-4 w-full max-w-2xl">
      <app-pool-view-selector [view]="pool.view()" (viewChange)="setView($event)" />

      <app-pool-toolbar
        [view]="pool.view()"
        [selectedCount]="pool.selectedIds().length"
        [selectionHasUsedTrack]="pool.selectionHasUsedTrack()"
        [totalCount]="pool.tracks().length"
        [availableCount]="pool.availableCount()"
        [usedCount]="pool.usedCount()"
        [disabledCount]="pool.disabledCount()"
        [missingPreviewCount]="pool.missingPreviewCount()"
        [cooldownDays]="pool.cooldownDays()"
        [cooldownTone]="pool.cooldownTone()"
        [addPanelOpen]="search.open()"
        (deselectAll)="pool.clearSelection()"
        (deleteSelection)="deleteSelection()"
        (toggleAdd)="togglePanel()" />

      @if (isPool() && search.open()) {
        <app-search-panel
          [query]="search.query()"
          [results]="search.results()"
          [searching]="search.searching()"
          [errorKey]="searchErrorKey()"
          [linked]="search.linked()"
          [existing]="pool.existingDeezerIds()"
          [addStatuses]="search.addStatuses()"
          [addErrorKeys]="addErrorKeys()"
          (queryChange)="onSearchQuery($event)"
          (toggleLink)="toggleLink()"
          (preview)="previewResult($event)"
          (add)="search.add($event.deezerTrackId)" />
      }

      <app-pool-filter-bar
        [filters]="pool.filters()"
        [view]="pool.view()"
        [genres]="pool.genres()"
        (textChange)="onFilterText($event)"
        (previewChange)="pool.setPreview($event)"
        (playedByChange)="pool.setPlayedBy($event)"
        (genreChange)="pool.setGenre($event)"
        (statusChange)="pool.setStatus($event)"
        (lastUsedFromChange)="pool.setLastUsedFrom($event)"
        (lastUsedToChange)="pool.setLastUsedTo($event)"
        (resetFilters)="pool.resetFilters()" />

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
        [view]="pool.view()"
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
        (openInPool)="pool.openInPool($event)"
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
  private readonly player = inject(AudioPreviewPlayer);
  protected readonly errorMessageKey = errorMessageKey;
  protected readonly isPool = computed(() => this.pool.view() === POOL_VIEW);
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
    // La vue (`?view=`) puis la page de la grille (`?page=3`, numérotée à partir de 1) vivent dans l'adresse : un
    // rechargement ou un lien partagé rouvre la même vue et la même page. La vue d'abord : en changer remet la page à zéro.
    const view = this.route.snapshot.queryParamMap.get('view');
    if (MODE_VIEWS.some(mode => mode.id === view)) this.pool.setView(view as string);
    const page = Number(this.route.snapshot.queryParamMap.get('page'));
    if (Number.isInteger(page) && page >= 1) this.pool.goToPage(page - 1);

    // Vue et page → adresse, seulement une fois le pool chargé (avant, la grille n'a qu'une page et celle de
    // l'adresse serait effacée). `replaceUrl` : « précédent » ne revient pas page par page, ni vue par vue.
    effect(() => {
      if (!this.pool.isFulfilled()) return;
      const current = this.pool.page() + 1;
      const view = this.pool.view();
      untracked(() => void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: current > 1 ? current : null, view: view === POOL_VIEW ? null : view },
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

  /** Change de vue ; le panneau d'ajout (propre au pool général) se ferme et son lecteur s'arrête. */
  protected setView(view: string): void {
    if (view !== POOL_VIEW && this.search.open()) this.togglePanel();
    this.pool.setView(view);
  }

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

  // --- fenêtres ---

  /** Un résultat Deezer s'écoute dans la même fenêtre qu'un morceau du pool, avec l'extrait déjà reçu. */
  protected previewResult(result: DeezerResult): void {
    this.modal.open(PreviewTrackDialog, { data: result, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }

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

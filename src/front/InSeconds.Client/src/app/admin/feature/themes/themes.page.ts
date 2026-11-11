import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AudioPreviewPlayer } from '../../../core/audio-preview/audio-preview.player';
import { PreviewTrackData, PreviewTrackDialog } from '../../../core/audio-preview/preview-track.dialog';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { AppError } from '../../../core/errors/app-error';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { CatalogueApi } from '../../data-access/catalogue.api';
import { DeezerSearchStore } from '../../data-access/deezer-search.store';
import { AdminCounts } from '../../data-access/admin-counts';
import { PoolStore } from '../../data-access/pool.store';
import { FileDownload } from '../../../core/download/file-download';
import { DeezerResult, PoolTrack, ThemeAssignment } from '../../domain/pool-track';
import { poolCsvFileName, poolToCsv } from '../../domain/theme-import';
import { themeRows } from '../../domain/themes';
import { ContentTabsComponent } from '../../ui/content-tabs/content-tabs.component';
import { ThemeImportComponent } from '../../ui/themes/theme-import/theme-import.component';
import { ThemeAddComponent } from '../../ui/themes/theme-add/theme-add.component';
import { ThemeIconPickerComponent } from '../../ui/themes/theme-icon-picker/theme-icon-picker.component';
import { ThemeDetailComponent } from '../../ui/themes/theme-detail/theme-detail.component';
import { ThemeListComponent } from '../../ui/themes/theme-list/theme-list.component';

const DIALOG_MAX_WIDTH = '26rem';

type DeezerStatus = 'loading' | 'success' | 'error';

/**
 * `/admin/themes` (onglet « Thèmes ») : les thèmes de morceaux, dont les manches de Setlist tirent leurs morceaux. À gauche (sur téléphone : seule, puis
 * remplacée par le détail), la liste avec recherche et puces d'état ; à droite, le détail du thème ouvert, qui défile avec la page comme le reste de l'admin : ses morceaux, paginés
 * (écoute ▶, retrait ✕ : le morceau reste dans le pool) et l'ajout de morceaux du pool ou de Deezer. Le thème ouvert et la page de ses morceaux vivent
 * dans l'adresse (`?theme=3&page=2`, page numérotée à partir de 1).
 */
@Component({
  selector: 'app-themes-page',
  imports: [TranslatePipe, ErrorMessageComponent, ThemeListComponent, ThemeDetailComponent, ThemeAddComponent, ThemeIconPickerComponent, ThemeImportComponent, ContentTabsComponent],
  providers: [PoolStore, DeezerSearchStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
  template: `
    <div class="w-full max-w-2xl lg:max-w-none mx-auto flex flex-col gap-3">
      @if (importing()) {
        <app-theme-import [tracks]="pool.tracks()" [themes]="pool.themes()" [busy]="importBusy()" [errorKey]="importErrorKey()" [added]="importAdded()"
          (closed)="closeImport()" (listen)="listen($event)" (applied)="applyImport($event)" (anotherRequested)="importAdded.set(null)" />
      } @else {
      <div class="flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:flex" [class.flex]="!selected()" [class.hidden]="selected()">
        <app-content-tabs [candidates]="candidateCount()" class="w-full lg:w-auto" />
        <h1 class="text-xl font-semibold lg:sr-only" style="color:var(--text-hi)">{{ 'admin.themes.title' | translate }}</h1>
        <span class="flex items-center gap-1 text-sm" style="color:var(--text-muted)">
          <button type="button" class="underline min-h-11 px-2" (click)="importing.set(true)" data-testid="themes-import">{{ 'admin.themes.import.open' | translate }}</button>
          <button type="button" class="underline min-h-11 px-2" (click)="exportPool()" data-testid="themes-export">{{ 'admin.themes.export' | translate }}</button>
        </span>
      </div>

      @if (pool.error(); as error) {
        <app-error-message [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      <div class="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <section class="lg:block" [class.hidden]="selected()">
          <app-theme-list [rows]="rows()" [selectedId]="selectedId()" [errorKey]="listErrorKey()" (opened)="open($event)" (add)="createTheme($event)" />
        </section>

        <section class="lg:block lg:rounded-(--radius-card) lg:p-4"
          [class.hidden]="!selected()" data-testid="theme-panel">
          @if (selected(); as theme) {
            @if (pickingIcon()) {
              <app-theme-icon-picker [themeName]="theme.name" [current]="theme.icon" [errorKey]="detailErrorKey()" (closed)="pickingIcon.set(false)" (choose)="setIcon(theme.id, $event)" />
            } @else if (adding()) {
              <app-theme-add [poolTracks]="pool.tracks()" [themeId]="theme.id" [deezerQuery]="search.query()" [deezerResults]="search.results()"
                [searching]="search.searching()" [searchErrorKey]="searchErrorKey()" [statuses]="deezerStatuses()"
                (closed)="adding.set(false)" (listen)="listen($event)" (previewResult)="previewResult($event)"
                (deezerQueryChange)="search.setQuery($event)" (addPicked)="addPicked(theme.id, $event)" (addDeezer)="addDeezer(theme.id, $event)" />
            } @else {
              <app-theme-detail [theme]="theme" [tracks]="themeTracks()" [errorKey]="detailErrorKey()" [page]="page()" [ready]="pool.isFulfilled()" (pageChange)="page.set($event)" (back)="closeDetail()"
                (rename)="renameTheme(theme.id, $event)" (remove)="deleteTheme(theme.id)" (addTracks)="adding.set(true)" (pickIcon)="pickingIcon.set(true)" (listen)="listen($event)"
                (removeTrack)="removeTrack(theme.id, $event)" />
            }
          } @else {
            <p class="hidden lg:block text-sm" style="color:var(--text-muted)">{{ 'admin.themes.pick' | translate }}</p>
          }
        </section>
      </div>
      }
    </div>
  `,
})
export class ThemesPage {
  protected readonly pool = inject(PoolStore);
  protected readonly search = inject(DeezerSearchStore);
  private readonly catalogue = inject(CatalogueApi);
  private readonly download = inject(FileDownload);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly errorMessageKey = errorMessageKey;
  /** Les candidats du sas à traiter, connus une fois le sas ouvert ; `null` avant. */
  protected readonly candidateCount = inject(AdminCounts).candidates;

  protected readonly selectedId = signal<number | null>(null);
  /** La page des morceaux du thème ouvert, à partir de 0. */
  protected readonly page = signal(0);
  protected readonly adding = signal(false);
  protected readonly pickingIcon = signal(false);
  protected readonly importing = signal(false);
  protected readonly importBusy = signal(false);
  protected readonly importAdded = signal<number | null>(null);
  protected readonly importErrorKey = signal<string | null>(null);
  protected readonly listErrorKey = signal<string | null>(null);
  protected readonly detailErrorKey = signal<string | null>(null);
  protected readonly deezerStatuses = signal<Readonly<Record<number, DeezerStatus>>>({});

  protected readonly rows = computed(() => themeRows(this.pool.themes(), this.pool.tracks()));
  protected readonly selected = computed(() => this.rows().find(r => r.id === this.selectedId()) ?? null);
  protected readonly themeTracks = computed(() => {
    const id = this.selectedId();
    return this.pool.tracks().filter(t => t.themeIds.includes(id ?? -1)).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  });
  protected readonly searchErrorKey = computed(() => {
    const error = this.search.searchError();
    return error ? errorMessageKey(error.code) : null;
  });

  constructor() {
    const id = Number(this.route.snapshot.queryParamMap.get('theme'));
    if (Number.isInteger(id) && id > 0) this.selectedId.set(id);
    const page = Number(this.route.snapshot.queryParamMap.get('page'));
    if (Number.isInteger(page) && page >= 1) this.page.set(page - 1);

    // Le thème ouvert et la page de ses morceaux → adresse, une fois la liste lue (un thème qui n'existe plus ferme le détail).
    effect(() => {
      if (!this.pool.isFulfilled()) return;
      const current = this.selected()?.id ?? null;
      const page = this.page() + 1;
      untracked(() => void this.router.navigate([], {
        relativeTo: this.route, queryParams: { theme: current, page: current !== null && page > 1 ? page : null }, queryParamsHandling: 'merge', replaceUrl: true,
      }));
    });

    inject(DestroyRef).onDestroy(() => this.search.setQuery(''));
    void this.pool.load();
  }

  protected open(id: number): void {
    this.adding.set(false);
    this.pickingIcon.set(false);
    this.detailErrorKey.set(null);
    this.page.set(0);
    this.selectedId.set(id);
  }

  protected closeDetail(): void {
    this.page.set(0);
    this.selectedId.set(null);
  }

  protected async createTheme(name: string): Promise<void> {
    const error = await this.pool.addTheme(name);
    this.listErrorKey.set(this.keyOf(error));
    const created = this.pool.themes().find(t => t.name === name.trim());
    if (!error && created) this.open(created.id);
  }

  protected async renameTheme(id: number, name: string): Promise<void> {
    this.detailErrorKey.set(this.keyOf(await this.pool.renameTheme(id, name)));
  }

  /** Enregistre l'icône (`null` : aucune) et revient au détail ; en cas d'erreur, le sélecteur reste ouvert pour réessayer. */
  protected async setIcon(id: number, icon: string | null): Promise<void> {
    const error = await this.pool.setThemeIcon(id, icon);
    this.detailErrorKey.set(this.keyOf(error));
    if (!error) this.pickingIcon.set(false);
  }

  protected async deleteTheme(id: number): Promise<void> {
    const error = await this.pool.deleteTheme(id);
    this.detailErrorKey.set(this.keyOf(error));
    if (!error) {
      this.page.set(0);
      this.selectedId.set(null);
    }
  }

  protected async removeTrack(themeId: number, track: PoolTrack): Promise<void> {
    this.detailErrorKey.set(this.keyOf(await this.pool.removeTrackFromTheme(themeId, track.id)));
  }

  protected async addPicked(themeId: number, ids: readonly number[]): Promise<void> {
    const error = await this.pool.addTracksToTheme(themeId, ids);
    this.detailErrorKey.set(this.keyOf(error));
    if (!error) this.adding.set(false);
  }

  protected exportPool(): void {
    this.download.saveText(poolCsvFileName(new Date()), poolToCsv(this.pool.tracks(), this.pool.themes()), 'text/csv;charset=utf-8');
  }

  protected closeImport(): void {
    this.importing.set(false);
    this.importAdded.set(null);
    this.importErrorKey.set(null);
  }

  /** Applique le classement validé dans l'aperçu : en une requête, sans rien retirer. */
  protected async applyImport(assignments: readonly ThemeAssignment[]): Promise<void> {
    this.importBusy.set(true);
    this.importErrorKey.set(null);
    const result = await this.pool.assignTracksToThemes(assignments);
    this.importBusy.set(false);
    if ('error' in result) this.importErrorKey.set(errorMessageKey(result.error.code));
    else this.importAdded.set(result.added);
  }

  protected async addDeezer(themeId: number, result: DeezerResult): Promise<void> {
    this.setStatus(result.deezerTrackId, 'loading');
    const error = await this.pool.addDeezerTrackToTheme(themeId, result.deezerTrackId);
    this.setStatus(result.deezerTrackId, error ? 'error' : 'success');
    this.detailErrorKey.set(this.keyOf(error));
  }

  private setStatus(deezerTrackId: number, status: DeezerStatus): void {
    this.deezerStatuses.update(statuses => ({ ...statuses, [deezerTrackId]: status }));
  }

  private keyOf(error: AppError | null): string | null {
    return error ? errorMessageKey(error.code) : null;
  }

  /** Le même ▶ et la même fenêtre d'écoute que dans l'onglet Morceaux. */
  protected listen(track: PoolTrack): void {
    const data: PreviewTrackData = { artist: track.artist, title: track.title, loadPreviewUrl: () => this.catalogue.findPreviewUrl(track) };
    this.modal.open(PreviewTrackDialog, { data, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }

  protected previewResult(result: DeezerResult): void {
    this.modal.open(PreviewTrackDialog, { data: result, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }
}

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
import { PoolStore } from '../../data-access/pool.store';
import { DeezerResult, PoolTrack } from '../../domain/pool-track';
import { themeRows } from '../../domain/themes';
import { ThemeAddComponent } from '../../ui/themes/theme-add/theme-add.component';
import { ThemeIconPickerComponent } from '../../ui/themes/theme-icon-picker/theme-icon-picker.component';
import { ThemeDetailComponent } from '../../ui/themes/theme-detail/theme-detail.component';
import { ThemeListComponent } from '../../ui/themes/theme-list/theme-list.component';

const DIALOG_MAX_WIDTH = '26rem';

type DeezerStatus = 'loading' | 'success' | 'error';

/**
 * `/admin/themes` (onglet « Thèmes ») : les thèmes de morceaux, dont les manches de Platines tirent leurs morceaux. À gauche (sur téléphone : seule, puis
 * remplacée par le détail), la liste avec recherche et puces d'état ; à droite, le détail du thème ouvert, collé sous les onglets sur PC et qui défile dans
 * lui-même : ses morceaux (écoute ▶, retrait ✕ : le morceau reste dans le pool) et l'ajout de morceaux du pool ou de Deezer. Le thème ouvert vit dans
 * l'adresse (`?theme=3`).
 */
@Component({
  selector: 'app-themes-page',
  imports: [TranslatePipe, ErrorMessageComponent, ThemeListComponent, ThemeDetailComponent, ThemeAddComponent, ThemeIconPickerComponent],
  providers: [PoolStore, DeezerSearchStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
  template: `
    <div class="w-full max-w-2xl lg:max-w-none mx-auto flex flex-col gap-4">
      <h1 class="text-xl font-semibold" style="color:var(--text-hi)" [class.hidden]="selected()" [class.lg:block]="true">{{ 'admin.themes.title' | translate }}</h1>

      @if (pool.error(); as error) {
        <app-error-message [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      <div class="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <section class="lg:block" [class.hidden]="selected()">
          <app-theme-list [rows]="rows()" [selectedId]="selectedId()" [errorKey]="listErrorKey()" (opened)="open($event)" (add)="createTheme($event)" />
        </section>

        <section class="lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-(--radius-card) lg:p-5"
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
              <app-theme-detail [theme]="theme" [tracks]="themeTracks()" [errorKey]="detailErrorKey()" (back)="selectedId.set(null)"
                (rename)="renameTheme(theme.id, $event)" (remove)="deleteTheme(theme.id)" (addTracks)="adding.set(true)" (pickIcon)="pickingIcon.set(true)" (listen)="listen($event)"
                (removeTrack)="removeTrack(theme.id, $event)" />
            }
          } @else {
            <p class="hidden lg:block text-sm" style="color:var(--text-muted)">{{ 'admin.themes.pick' | translate }}</p>
          }
        </section>
      </div>
    </div>
  `,
})
export class ThemesPage {
  protected readonly pool = inject(PoolStore);
  protected readonly search = inject(DeezerSearchStore);
  private readonly catalogue = inject(CatalogueApi);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly errorMessageKey = errorMessageKey;

  protected readonly selectedId = signal<number | null>(null);
  protected readonly adding = signal(false);
  protected readonly pickingIcon = signal(false);
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

    // Le thème ouvert → adresse, une fois la liste lue (un thème qui n'existe plus ferme le détail).
    effect(() => {
      if (!this.pool.isFulfilled()) return;
      const current = this.selected()?.id ?? null;
      untracked(() => void this.router.navigate([], {
        relativeTo: this.route, queryParams: { theme: current }, queryParamsHandling: 'merge', replaceUrl: true,
      }));
    });

    inject(DestroyRef).onDestroy(() => this.search.setQuery(''));
    void this.pool.load();
  }

  protected open(id: number): void {
    this.adding.set(false);
    this.pickingIcon.set(false);
    this.detailErrorKey.set(null);
    this.selectedId.set(id);
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
    if (!error) this.selectedId.set(null);
  }

  protected async removeTrack(themeId: number, track: PoolTrack): Promise<void> {
    this.detailErrorKey.set(this.keyOf(await this.pool.removeTrackFromTheme(themeId, track.id)));
  }

  protected async addPicked(themeId: number, ids: readonly number[]): Promise<void> {
    const error = await this.pool.addTracksToTheme(themeId, ids);
    this.detailErrorKey.set(this.keyOf(error));
    if (!error) this.adding.set(false);
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

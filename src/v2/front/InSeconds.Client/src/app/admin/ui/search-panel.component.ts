import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DeezerResult } from '../domain/pool-track';

type AddStatus = 'loading' | 'success' | 'error';

/**
 * Le panneau de recherche et d'ajout, posé au-dessus du tableau du pool (jamais en fenêtre : le
 * tableau reste visible, pour repérer un doublon). Chaque résultat s'écoute et s'ajoute en un
 * clic ; un résultat déjà dans le pool porte un avertissement qui ne bloque pas l'ajout.
 */
@Component({
  selector: 'app-search-panel',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-4 flex flex-col gap-3" style="background:var(--bg-surface)">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-light)">{{ 'admin.addPanel.title' | translate }}</h3>
        <button type="button" (click)="toggleLink.emit()"
          class="text-xs px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shrink-0"
          [style.color]="linked() ? 'var(--text-indigo)' : 'var(--text-muted)'"
          style="border:1px solid var(--border-strong)">
          {{ linked() ? '🔗' : '🔓' }} {{ (linked() ? 'admin.addPanel.linked' : 'admin.addPanel.unlinked') | translate }}
        </button>
      </div>

      <input type="text" [value]="query()" (input)="queryChange.emit($any($event.target).value)"
        [placeholder]="'admin.addPanel.searchPlaceholder' | translate"
        [attr.aria-label]="'admin.addPanel.searchPlaceholder' | translate"
        class="rounded-lg px-3 py-2 outline-none text-sm"
        style="background:var(--bg-inactive);color:var(--text-hi)" />

      @if (searching()) {
        <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.addPanel.searching' | translate }}</p>
      }

      @if (errorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)">{{ key | translate }}</p>
      }

      @if (results().length > 0) {
        <ul class="rounded-lg max-h-72 overflow-y-auto flex flex-col" style="background:var(--bg-inactive)">
          @for (track of results(); track track.deezerTrackId) {
            <li class="flex items-center gap-3 px-4 py-2.5" style="border-bottom:1px solid var(--border-medium)">
              <button type="button" (click)="preview.emit(track)" [disabled]="!track.previewUrl"
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors text-sm disabled:opacity-30"
                style="background:var(--bg-primary-dk);color:var(--text-on-primary)">
                {{ isPreviewing(track) && playing() ? '⏸' : '▶' }}
              </button>
              <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                <span class="text-sm truncate" style="color:var(--text-light)">{{ track.artist }} — {{ track.title }}</span>
                @if (existing().has(track.deezerTrackId)) {
                  <span class="text-xs" style="color:var(--color-warn)">
                    ⚠ {{ (existing().get(track.deezerTrackId) ? 'admin.addPanel.alreadyInPool' : 'admin.addPanel.alreadyUsed') | translate }}
                  </span>
                }
                @if (isPreviewing(track)) {
                  <div class="w-full rounded-full h-1 mt-0.5" style="background:var(--bg-surface-2)" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
                    <div class="h-1 rounded-full transition-all" style="background:var(--text-indigo)" [style.width.%]="progress()"></div>
                  </div>
                }
              </div>
              @let status = statusOf(track);
              <button type="button" (click)="add.emit(track)" [disabled]="status === 'loading'"
                [title]="errorTitle(track) | translate"
                class="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                style="background:var(--bg-primary-dk);color:var(--text-on-primary)">
                @switch (status) {
                  @case ('loading') { … }
                  @case ('success') { {{ 'admin.addPanel.added' | translate }} }
                  @case ('error') { {{ 'admin.addPanel.addError' | translate }} }
                  @default { {{ 'admin.addPanel.addTrack' | translate }} }
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class SearchPanelComponent {
  readonly query = input.required<string>();
  readonly results = input.required<readonly DeezerResult[]>();
  readonly searching = input(false);
  /** Clé de traduction du message quand la recherche a échoué (Deezer indisponible…). */
  readonly errorKey = input<string | null>(null);
  readonly linked = input(false);
  /** Identifiant Deezer → vrai si le morceau est dans le pool et disponible, faux s'il a déjà servi. */
  readonly existing = input.required<ReadonlyMap<number, boolean>>();
  readonly addStatuses = input<Readonly<Record<number, AddStatus>>>({});
  /** Clé de traduction de la raison de l'échec d'ajout de chaque ligne (infobulle du bouton). */
  readonly addErrorKeys = input<Readonly<Record<number, string>>>({});
  /** L'extrait chargé dans le lecteur, sa lecture en cours et son avancement (0 à 100). */
  readonly previewingUrl = input<string | null>(null);
  readonly playing = input(false);
  readonly progress = input(0);

  readonly queryChange = output<string>();
  readonly toggleLink = output();
  readonly preview = output<DeezerResult>();
  readonly add = output<DeezerResult>();

  protected isPreviewing(track: DeezerResult): boolean {
    return track.previewUrl !== null && this.previewingUrl() === track.previewUrl;
  }

  protected statusOf(track: DeezerResult): AddStatus | 'idle' {
    return this.addStatuses()[track.deezerTrackId] ?? 'idle';
  }

  protected errorTitle(track: DeezerResult): string {
    return this.addErrorKeys()[track.deezerTrackId] ?? '';
  }
}

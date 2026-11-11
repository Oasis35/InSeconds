import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AudioPreviewPlayer } from '../../../core/audio-preview/audio-preview.player';
import { PreviewTrackData, PreviewTrackDialog } from '../../../core/audio-preview/preview-track.dialog';
import { AppError } from '../../../core/errors/app-error';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { CandidatesStore } from '../../data-access/candidates.store';
import { Candidate, CANDIDATE_PRIORITIES, ParsedCandidateImport, PriorityFilter } from '../../domain/candidates';
import { CandidateImportComponent } from '../../ui/candidates/candidate-import/candidate-import.component';
import { CandidateListComponent } from '../../ui/candidates/candidate-list/candidate-list.component';
import { ContentTabsComponent } from '../../ui/content-tabs/content-tabs.component';

const DIALOG_MAX_WIDTH = '26rem';

/**
 * `/admin/a-valider` (onglet « Contenu », page « À valider ») : le sas des morceaux candidats. L'admin colle ou charge des identifiants Deezer
 * (sans limite de 50), ils sont lus chez Deezer tout de suite, en arrière-plan et par lots espacés (la liste se rafraîchit seule), puis il écoute
 * chaque extrait (▶ à gauche), coche ce qu'il garde et clique « Ajouter la sélection » : rien n'entre dans le pool sans ce clic. Ce qu'il ne veut
 * pas est écarté (et ne revient pas à un nouvel import), et peut être remis.
 */
@Component({
  selector: 'app-candidates-page',
  imports: [TranslatePipe, ButtonComponent, ErrorMessageComponent, ContentTabsComponent, CandidateImportComponent, CandidateListComponent],
  providers: [CandidatesStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
  template: `
    <div class="flex flex-col gap-4 w-full max-w-2xl lg:max-w-none">
      <app-content-tabs [candidates]="store.isFulfilled() ? store.todoCount() : null" />

      <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.candidates.help' | translate }}</p>

      <app-candidate-import [busy]="store.busy()" [errorKey]="importErrorKey()" (imported)="importItems($event)" />

      @if (store.lastImport(); as result) {
        <p role="status" class="text-sm" style="color:var(--text-hi)" data-testid="candidates-import-result">
          {{ 'admin.candidates.importDone' | translate: result }}
        </p>
      }

      @if (store.error(); as error) {
        <app-error-message [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      <div class="flex flex-wrap items-center gap-2" role="group">
        <button type="button" class="text-sm px-3 min-h-11 rounded-full" data-testid="candidates-view-todo" [attr.aria-pressed]="store.view() === 'todo'"
          [style.color]="store.view() === 'todo' ? 'var(--text-hi)' : 'var(--text-muted)'" [style.background]="store.view() === 'todo' ? 'var(--text-sep)' : 'transparent'"
          style="border:1px solid var(--border-neutral)" (click)="store.setView('todo')">{{ 'admin.candidates.viewTodo' | translate: { count: store.todoCount() } }}</button>
        <button type="button" class="text-sm px-3 min-h-11 rounded-full" data-testid="candidates-view-dismissed" [attr.aria-pressed]="store.view() === 'dismissed'"
          [style.color]="store.view() === 'dismissed' ? 'var(--text-hi)' : 'var(--text-muted)'" [style.background]="store.view() === 'dismissed' ? 'var(--text-sep)' : 'transparent'"
          style="border:1px solid var(--border-neutral)" (click)="store.setView('dismissed')">{{ 'admin.candidates.viewDismissed' | translate: { count: store.dismissedCount() } }}</button>
        <select class="app-input w-auto ml-auto" [value]="store.priority() ?? ''" (change)="setPriority($event)" [attr.aria-label]="'admin.candidates.filterPriority' | translate"
          data-testid="candidates-filter-priority">
          <option value="">{{ 'admin.candidates.priorityAll' | translate }}</option>
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
          <option value="none">{{ 'admin.candidates.priorityNone' | translate }}</option>
        </select>
      </div>

      @if (store.pendingCount() > 0) {
        <p class="text-xs flex flex-wrap items-center gap-x-3" style="color:var(--text-muted)" role="status" data-testid="candidates-reading">
          {{ 'admin.candidates.readingCount' | translate: { count: store.pendingCount() } }}
          <button type="button" class="underline min-h-11" (click)="store.reread()" [disabled]="store.busy()">{{ 'admin.candidates.reread' | translate }}</button>
        </p>
      }

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="text-sm underline min-h-11 px-1" style="color:var(--text-muted)" (click)="store.toggleAllShown()" data-testid="candidates-toggle-all"
          [disabled]="store.view() === 'todo' && store.addableShownIds().length === 0">
          {{ (store.selectedIds().length > 0 ? 'admin.candidates.clearAll' : 'admin.candidates.selectAll') | translate }}
        </button>
        @if (store.view() === 'todo') {
          <button type="button" appButton size="sm" class="ml-auto" [disabled]="store.busy() || store.addableSelectedIds().length === 0" (click)="addSelected()"
            data-testid="candidates-add">{{ 'admin.candidates.addSelected' | translate: { count: store.addableSelectedIds().length } }}</button>
          <button type="button" appButton variant="neutral" size="sm" [disabled]="store.busy() || store.selectedIds().length === 0" (click)="dismiss()"
            data-testid="candidates-dismiss">{{ 'admin.candidates.dismiss' | translate }}</button>
        } @else {
          <button type="button" appButton variant="neutral" size="sm" class="ml-auto" [disabled]="store.busy() || store.selectedIds().length === 0" (click)="restore()"
            data-testid="candidates-restore">{{ 'admin.candidates.restore' | translate }}</button>
        }
      </div>

      @if (store.lastAdd(); as result) {
        <p role="status" class="text-sm" style="color:var(--text-hi)" data-testid="candidates-add-result">{{ 'admin.candidates.addDone' | translate: result }}</p>
      }
      @if (actionErrorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="candidates-action-error">{{ key | translate }}</p>
      }

      <app-candidate-list [candidates]="store.shown()" [selectedIds]="store.selectedIds()" [dismissedView]="store.view() === 'dismissed'"
        (selectionToggle)="store.toggleSelection($event)" (listen)="listen($event)" />
      @if (store.isFulfilled() && store.shown().length === 0) {
        <p class="text-sm" style="color:var(--text-muted)" data-testid="candidates-empty">
          {{ (store.view() === 'todo' ? 'admin.candidates.empty' : 'admin.candidates.emptyDismissed') | translate }}
        </p>
      }
    </div>
  `,
})
export class CandidatesPage {
  protected readonly store = inject(CandidatesStore);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  protected readonly errorMessageKey = errorMessageKey;
  protected readonly priorities = CANDIDATE_PRIORITIES;
  protected readonly importErrorKey = signal<string | null>(null);
  protected readonly actionErrorKey = signal<string | null>(null);

  constructor() {
    void this.store.load();
  }

  protected async importItems(parsed: ParsedCandidateImport): Promise<void> {
    this.importErrorKey.set(this.keyOf(await this.store.importItems(parsed)));
  }

  protected async addSelected(): Promise<void> {
    this.actionErrorKey.set(this.keyOf(await this.store.addSelected()));
  }

  protected async dismiss(): Promise<void> {
    this.actionErrorKey.set(this.keyOf(await this.store.dismissSelected()));
  }

  protected async restore(): Promise<void> {
    this.actionErrorKey.set(this.keyOf(await this.store.restoreSelected()));
  }

  protected setPriority(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setPriority(value === 'A' || value === 'B' || value === 'C' || value === 'none' ? (value as PriorityFilter) : null);
  }

  /** La fenêtre d'écoute de l'admin ; l'adresse de l'extrait est demandée à l'ouverture, elle expire au bout de 15 min (piège 14). */
  protected listen(candidate: Candidate): void {
    const data: PreviewTrackData = {
      artist: candidate.artist ?? '',
      title: candidate.title ?? '',
      loadPreviewUrl: () => this.store.previewUrl(candidate.id),
    };
    this.modal.open(PreviewTrackDialog, { data, maxWidth: DIALOG_MAX_WIDTH, injector: this.injector });
  }

  private keyOf(error: AppError | null): string | null {
    return error ? errorMessageKey(error.code) : null;
  }
}

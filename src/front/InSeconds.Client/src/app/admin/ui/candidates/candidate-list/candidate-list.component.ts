import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Candidate, isAddable } from '../../../domain/candidates';

/**
 * La liste du sas « À valider » : une ligne par candidat. À gauche, un ▶ qui écoute un extrait tout frais (à la place de la pochette : aucune image
 * de Deezer n'est montrée ni gardée), au milieu l'artiste, le titre, l'année et ce qui empêche l'ajout le cas échéant, à droite la priorité
 * (A, B, C si l'import en donnait une) et la case à cocher. On ne coche que ce qu'on peut ajouter.
 */
@Component({
  selector: 'app-candidate-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col" data-testid="candidates-list">
      @for (c of candidates(); track c.id) {
        <li class="flex items-center gap-3 py-2.5" style="border-top:1px solid var(--border-subtle)" data-testid="candidate">
          <button type="button" (click)="listen.emit(c)" [disabled]="c.status !== 'ready' || c.preview === 'missing'"
            class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full shrink-0 disabled:opacity-30"
            style="color:var(--color-accent-2);border:1px solid rgb(var(--rgb-accent-2) / 0.4)"
            [title]="'admin.pool.listenTitle' | translate" [attr.aria-label]="'admin.pool.listenTitle' | translate" data-testid="candidate-listen">▶</button>
          <span class="flex-1 min-w-0 flex flex-col">
            @if (c.status === 'ready') {
              <span class="truncate text-sm" style="color:var(--text-hi)">{{ c.title }}</span>
              <span class="truncate text-xs" style="color:var(--text-muted)">{{ c.artist }}@if (c.releaseYear) { · {{ c.releaseYear }}}</span>
            } @else {
              <span class="truncate text-sm" style="color:var(--text-muted)">{{ c.deezerTrackId }}</span>
            }
            @if (note(c); as key) {
              <span class="text-xs" [style.color]="warning(c) ? 'var(--text-error)' : 'var(--text-muted)'" data-testid="candidate-note">{{ key | translate }}</span>
            }
          </span>
          @if (c.priority) {
            <span class="shrink-0 text-xs px-2 py-0.5 rounded-full" style="color:var(--text-muted);border:1px solid var(--border-neutral)" data-testid="candidate-priority">{{ c.priority }}</span>
          }
          <label class="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center cursor-pointer">
            <input type="checkbox" class="w-6 h-6 cursor-pointer disabled:opacity-30" [disabled]="!addable(c) && !dismissedView()"
              [checked]="selectedIds().includes(c.id)" (change)="selectionToggle.emit(c.id)" [attr.aria-label]="label(c)" data-testid="candidate-check" />
          </label>
        </li>
      }
    </ul>
  `,
})
export class CandidateListComponent {
  readonly candidates = input.required<readonly Candidate[]>();
  readonly selectedIds = input<readonly number[]>([]);
  /** La vue « Écartés » : tout se coche (pour les remettre), même ce qui n'est pas ajoutable. */
  readonly dismissedView = input(false);
  readonly selectionToggle = output<number>();
  readonly listen = output<Candidate>();

  protected addable = isAddable;

  protected label(candidate: Candidate): string {
    return candidate.status === 'ready' ? `${candidate.artist} - ${candidate.title}` : String(candidate.deezerTrackId);
  }

  /** Ce qui explique qu'on ne puisse pas ajouter le candidat ; `null` quand rien n'est à dire. */
  protected note(candidate: Candidate): string | null {
    if (candidate.isAdding) return 'admin.candidates.adding';
    if (candidate.inCatalogue) return 'admin.candidates.inCatalogue';
    if (candidate.status === 'pending') return 'admin.candidates.reading';
    if (candidate.status === 'not_found') return 'admin.candidates.notFound';
    if (candidate.preview === 'missing') return 'admin.candidates.noPreview';
    return null;
  }

  protected warning(candidate: Candidate): boolean {
    return candidate.status === 'not_found' || candidate.preview === 'missing';
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RefreshReport } from '../domain/actions';

type Phase = 'idle' | 'queued' | 'running';

/** Bloc « Previews Deezer » : le bouton qui lance le contrôle des extraits, son avancement et son compte rendu. */
@Component({
  selector: 'app-action-refresh-previews',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.actions.previews' | translate }}</h2>
      <div class="flex items-center gap-3">
        <button type="button" (click)="refresh.emit()" [disabled]="phase() !== 'idle'"
          class="text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          style="background:var(--bg-primary);color:var(--text-on-primary)">
          @if (phase() === 'idle') { <span>🔄</span> {{ 'admin.actions.refreshPreviews' | translate }} }
          @else { <span>⏳</span> {{ (phase() === 'queued' ? 'admin.actions.refreshQueued' : 'admin.actions.refreshingPreviews') | translate }} }
        </button>
        @if (report(); as r) {
          <span class="text-xs" role="status" style="color:var(--color-success)">
            {{ 'admin.actions.refreshPreviewsSuccess' | translate: { checked: r.checked, updated: r.updated, failed: r.failed } }}
          </span>
        }
        @if (failed()) {
          <span class="text-xs" role="status" style="color:var(--text-error)">{{ 'admin.actions.refreshPreviewsError' | translate }}</span>
        }
      </div>
    </div>
  `,
})
export class ActionRefreshPreviewsComponent {
  readonly phase = input.required<Phase>();
  readonly report = input<RefreshReport | null>(null);
  readonly failed = input(false);
  readonly refresh = output<void>();
}

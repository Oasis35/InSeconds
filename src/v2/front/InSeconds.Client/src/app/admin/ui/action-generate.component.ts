import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { GenerateOutcome } from '../domain/actions';

type Phase = 'idle' | 'queued' | 'running';

const OUTCOME: Record<GenerateOutcome, { key: string; color: string }> = {
  created: { key: 'admin.actions.generated', color: 'var(--color-success)' },
  already: { key: 'admin.actions.alreadyGenerated', color: 'var(--color-warn)' },
  pool_insufficient: { key: 'admin.actions.poolInsufficient', color: 'var(--bg-warn)' },
  retry: { key: 'admin.actions.generateRetry', color: 'var(--color-warn)' },
  error: { key: 'admin.actions.generateError', color: 'var(--text-error)' },
};

/** Bloc « Défi du jour » : le bouton qui lance la génération, son avancement et son résultat. */
@Component({
  selector: 'app-action-generate',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.actions.challengeOfDay' | translate }}</h2>
      <div class="flex items-center gap-3">
        <button type="button" (click)="generate.emit()" [disabled]="phase() !== 'idle'"
          class="text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          style="background:var(--bg-primary);color:var(--text-on-primary)">
          @if (phase() === 'idle') { <span>▶</span> {{ 'admin.actions.generate' | translate }} }
          @else { <span>⏳</span> {{ (phase() === 'queued' ? 'admin.actions.generateQueued' : 'admin.actions.generating') | translate }} }
        </button>
        @if (message(); as m) {
          <span class="text-xs" role="status" [style.color]="m.color">{{ m.key | translate }}</span>
        }
      </div>
    </div>
  `,
})
export class ActionGenerateComponent {
  readonly phase = input.required<Phase>();
  readonly outcome = input<GenerateOutcome | null>(null);
  readonly generate = output<void>();

  protected readonly message = computed(() => {
    const outcome = this.outcome();
    return outcome ? OUTCOME[outcome] : null;
  });
}

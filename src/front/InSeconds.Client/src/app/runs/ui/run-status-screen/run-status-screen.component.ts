import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Ce que l'écran dit : pas de playlist, une playlist inconnue (lien erroné), ou une erreur. Sans accès sur invitation, il n'y a pas d'écran : la page renvoie au jeu du jour. */
export type RunStatusKind = 'no_challenge' | 'not_found' | 'error';

/** Un refus ou une erreur du mode : un titre, une phrase, le code d'erreur s'il y en a un, « Réessayer » et le retour au jeu du jour. */
@Component({
  selector: 'app-run-status-screen',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="screen-enter flex-1 flex flex-col items-center justify-center gap-6 text-center px-4" data-testid="run-status">
      <div class="space-y-2">
        <h2 class="text-xl font-bold" style="font-family:var(--font-display);color:var(--text-hi)">{{ titleKey() | translate }}</h2>
        <p class="text-sm" style="color:var(--text-faint);white-space:pre-line">{{ bodyKey() | translate }}</p>
        @if (errorCode()) {
          <p class="text-xs" data-testid="error-code" style="color:var(--text-faint)">
            {{ 'errors.code' | translate }} <span class="select-all font-mono">{{ errorCode() }}</span>
          </p>
        }
      </div>
      <div class="flex flex-col items-center gap-3">
        @if (kind() !== 'not_found') {
          <button type="button" (click)="retry.emit()" data-testid="run-retry"
            class="px-6 py-3 rounded-(--radius-button) text-sm font-bold uppercase transition-colors"
            style="font-family:var(--font-display);letter-spacing:0.06em;background:var(--bg-surface);color:var(--text-slate);border:1px solid var(--border-subtle)">
            {{ 'common.retry' | translate }}
          </button>
        }
        <a routerLink="/daily" class="text-sm underline" style="color:var(--text-muted)">{{ 'runs.status.backToDaily' | translate }}</a>
      </div>
    </div>
  `,
})
export class RunStatusScreenComponent {
  readonly kind = input.required<RunStatusKind>();
  /** Code d'erreur (traceId renvoyé par l'API) que le joueur peut communiquer, masqué si absent (comme au Daily). */
  readonly errorCode = input<string | null>(null);
  readonly retry = output();

  protected readonly titleKey = computed(() => `runs.status.${this.kind()}.title`);
  protected readonly bodyKey = computed(() => `runs.status.${this.kind()}.body`);
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService, ToastTone } from './toast.service';

const TONE_COLORS: Record<ToastTone, string> = {
  info: 'var(--color-accent-2)',
  success: 'var(--color-success)',
  error: 'var(--color-fail)',
};

/**
 * Zone d'affichage des toasts, en bas de l'écran. `role="status"` + `aria-live="polite"` : les
 * lecteurs d'écran annoncent le message sans interrompre le joueur.
 */
@Component({
  selector: 'app-toast-host',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="status" aria-live="polite"
      class="fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none">
      @for (toast of toasts.toasts(); track toast.id) {
        <div data-testid="toast" class="pointer-events-auto w-full max-w-sm flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-2xl toast-enter"
          style="background:var(--bg-surface-2);color:var(--text-body)"
          [style.border]="'1px solid ' + color(toast.tone)">
          <span class="flex-1">{{ toast.messageKey | translate: toast.params }}</span>
          <button type="button" (click)="toasts.dismiss(toast.id)" [attr.aria-label]="'common.close' | translate"
            class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10" style="color:var(--text-muted)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
              stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected color(tone: ToastTone): string {
    return TONE_COLORS[tone];
  }
}

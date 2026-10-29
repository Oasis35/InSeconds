import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Couleur du liseré gauche : orange pour le joueur (sa série), cyan pour le gel. */
export type ToastFrameAccent = 'orange' | 'cyan';

const ACCENT_CLASSES: Record<ToastFrameAccent, string> = {
  orange: 'border-l-(--color-accent-3)',
  cyan: 'border-l-(--color-accent-2)',
};

/**
 * Cadre d'un toast posé en bas de l'écran (toasts de série du jeu du jour) : panneau translucide
 * flouté, liseré gauche coloré, contenu projeté. `animationClass` porte l'animation d'entrée propre
 * à chaque toast (classe `animate-[…]` écrite dans le toast) ; le panneau reçoit alors `data-anim`,
 * qui la remplace par un fondu en mouvement réduit et la coupe sous E2E (`styles.scss`).
 */
@Component({
  selector: 'app-toast-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed left-1/2 bottom-[18px] z-20 w-full max-w-[402px] px-4 -translate-x-1/2' },
  template: `
    <div class="relative overflow-hidden flex items-center gap-3 min-h-14 px-3.5 py-3 rounded-xl border-l-3 bg-[rgb(var(--rgb-panel)/0.94)] backdrop-blur-[10px]"
         [class]="panelClasses()" [attr.data-anim]="animationClass() ? '' : null">
      <ng-content />
    </div>
  `,
})
export class ToastFrameComponent {
  readonly accent = input.required<ToastFrameAccent>();
  readonly animationClass = input<string>('');

  protected readonly panelClasses = computed(() => `${ACCENT_CLASSES[this.accent()]} ${this.animationClass()}`.trim());
}

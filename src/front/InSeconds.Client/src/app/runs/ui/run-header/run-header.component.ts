import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { pop } from '../../../ui/motion/motion';

/**
 * L'en-tête de la partie : ✕ (abandonner, confirmé par la page), les vies (un cœur plein par vie qui reste, un contour pour celle qui est
 * perdue), rien de plus : « Manche N », le score et le palier sont dans le bloc du haut (`app-run-scoreboard`). À droite, le haut-parleur coupe
 * ou remet les sons d'interface (son libellé dit ce que fait le toucher).
 */
@Component({
  selector: 'app-run-header',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2.5" style="height:44px">
      <button type="button" (click)="abandon.emit()" class="grid place-items-center touch-manipulation shrink-0 -ml-2"
        style="width:40px;height:44px;color:var(--text-muted)" [attr.aria-label]="'runs.header.abandon' | translate" data-testid="run-abandon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M5 5 L19 19 M19 5 L5 19" />
        </svg>
      </button>
      <div #heartsRow class="flex-1 flex flex-wrap items-center justify-center gap-2" data-testid="run-lives" role="img"
        [attr.aria-label]="'runs.header.lives' | translate: { left: livesLeft(), total: lives().length }">
        @for (alive of lives(); track $index) {
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" [attr.data-alive]="alive">
            <path d="M12 21 C5 15.5 2.5 12 2.5 8.5 A4.8 4.8 0 0 1 12 6.6 A4.8 4.8 0 0 1 21.5 8.5 C21.5 12 19 15.5 12 21 Z"
              [attr.fill]="alive ? 'var(--color-accent)' : 'none'" [attr.stroke]="alive ? 'var(--color-accent)' : 'var(--text-faint)'" stroke-width="1.8" stroke-linejoin="round" />
          </svg>
        }
      </div>
      <button type="button" (click)="toggleSounds.emit()" class="grid place-items-center touch-manipulation shrink-0 -mr-2"
        style="width:40px;height:44px;color:var(--text-muted)" data-testid="run-sounds"
        [attr.aria-label]="(muted() ? 'runs.header.soundsOn' : 'runs.header.soundsOff') | translate">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
          @if (muted()) {
            <path d="M17 9 L22 15 M22 9 L17 15" />
          } @else {
            <path d="M17 9 a4 4 0 0 1 0 6 M19.5 6.5 a7.5 7.5 0 0 1 0 11" />
          }
        </svg>
      </button>
    </div>
  `,
})
export class RunHeaderComponent {
  /** Une valeur par vie de départ : vrai pour celle qui reste. */
  readonly lives = input.required<readonly boolean[]>();
  readonly abandon = output();
  /** Les sons d'interface sont coupés. */
  readonly muted = input(false);
  /** Couper ou remettre les sons d'interface. */
  readonly toggleSounds = output();

  private readonly livesRow = viewChild<ElementRef<HTMLElement>>('heartsRow');
  /** Les vies du dernier affichage : le petit temps fort ne se joue que lorsqu'une vie vient de se perdre ou d'être rendue. */
  private lastLeft: number | null = null;

  protected livesLeft(): number {
    return this.lives().filter(Boolean).length;
  }

  constructor() {
    effect(() => {
      const left = this.livesLeft();
      const element = this.livesRow()?.nativeElement;
      if (element && this.lastLeft !== null && left !== this.lastLeft) pop(element);
      this.lastLeft = left;
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InstallStepsComponent } from '../../../ui/install-steps/install-steps.component';
import { InstallPromptService } from '../../pwa/install-prompt.service';

/** Parties terminées avant de proposer l'installation : à la première le joueur ne sait pas encore s'il revient, à la deuxième oui. */
export const INSTALL_LINE_MIN_GAMES = 2;

/**
 * La ligne « Ajoute InSeconds à ton écran d'accueil » sous les cartes de l'accueil : une ligne basse, pas une tuile (le défi reste le seul focus). Elle
 * n'apparaît que sur un téléphone ou une tablette où l'installation est possible, après la {@link INSTALL_LINE_MIN_GAMES}e partie, et plus une fois fermée.
 * Android : « Ajouter » lance l'invite du navigateur. iPhone : « Ajouter » déplie les deux étapes de Safari.
 */
@Component({
  selector: 'app-install-line',
  imports: [TranslatePipe, InstallStepsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (visible()) {
      <section class="flex flex-col gap-2 rounded-(--radius-card) py-1.5 pl-4 pr-2" style="background:var(--bg-surface);border:1px solid var(--border-medium)"
        data-testid="install-line" [attr.aria-label]="'shell.install.lineLabel' | translate">
        <div class="flex items-center gap-3">
          <p class="flex-1 text-[13px] leading-snug" style="color:var(--text-light)">{{ 'shell.install.line' | translate }}</p>
          <button type="button" (click)="add()" data-testid="install-add"
            class="min-h-11 shrink-0 rounded-(--radius-button) px-3 font-display text-[11px] font-bold uppercase tracking-[.06em] cursor-pointer touch-manipulation"
            style="border:1.5px solid var(--border-neutral);color:var(--text-hi)">{{ 'shell.install.add' | translate }}</button>
          <button type="button" (click)="install.dismissLine()" data-testid="install-dismiss" [attr.aria-label]="'common.close' | translate"
            class="w-8 min-h-11 shrink-0 text-sm cursor-pointer touch-manipulation" style="color:var(--text-muted)">✕</button>
        </div>
        @if (stepsOpen()) {
          <div class="pb-2 pr-2"><app-install-steps /></div>
        }
      </section>
    }
  `,
})
export class InstallLineComponent {
  protected readonly install = inject(InstallPromptService);
  /** Les parties terminées du joueur, celle du jour comprise ; `null` tant qu'on ne les connaît pas. */
  readonly gamesPlayed = input<number | null>(null);
  protected readonly stepsOpen = signal(false);

  protected readonly visible = computed(() => this.install.mode() !== null && !this.install.lineDismissed() && (this.gamesPlayed() ?? 0) >= INSTALL_LINE_MIN_GAMES);

  protected async add(): Promise<void> {
    if (this.install.mode() === 'ios') {
      this.stepsOpen.update(open => !open);
      return;
    }
    // Un joueur qui accepte installe l'appli (`appinstalled` cache la ligne) ; un refus la laisse là, sans insister.
    await this.install.promptNative();
  }
}

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { GuestTileKind } from '../../domain/toasts';
import { pluralKey } from '../../domain/streak';
import { StreakIconComponent, StreakIconName } from '../streak-icon/streak-icon.component';

/**
 * La tuile « crée un compte » d'un invité, sous la carte du défi : ce que le compte lui garde (parties, série, gel, amis), « Créer un compte » et
 * « J'ai déjà un compte ». Une croix la ferme (elle revient sur un événement ou après quelques jours, `domain/toasts`), sauf la série perdue, dite une fois.
 */
@Component({
  selector: 'app-guest-account-tile',
  imports: [RouterLink, TranslatePipe, ButtonComponent, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="relative rounded-(--radius-card) p-5 flex flex-col gap-3" data-testid="guest-tile" [attr.data-kind]="kind()"
      style="background:var(--bg-surface);border:1px solid var(--border-medium)">
      <div class="flex items-start gap-3" [class.pr-9]="kind() !== 'lost'">
        <span class="shrink-0 mt-0.5 text-xl" [style.color]="iconColor()"><app-streak-icon [name]="icon()" /></span>
        <div class="min-w-0 flex flex-col gap-1">
          <h2 class="text-base font-semibold" style="font-family:var(--font-body);color:var(--text-hi)">{{ titleKey() | translate: { streak: streak() } }}</h2>
          <p class="text-[13px] leading-snug" style="color:var(--text-muted)">{{ 'daily.guestTile.' + kind() + '.body' | translate }}</p>
        </div>
      </div>
      @if (kind() !== 'lost') {
        <button type="button" (click)="dismissed.emit()" [attr.aria-label]="'daily.guestTile.dismiss' | translate" data-testid="guest-tile-dismiss"
          class="absolute top-1 right-1 w-11 h-11 flex items-center justify-center text-sm touch-manipulation" style="color:var(--text-muted)">✕</button>
      }
      <a appButton variant="neutral" [block]="true" routerLink="/account/login" data-testid="guest-tile-create">{{ 'daily.guestTile.create' | translate }}</a>
      <a routerLink="/account/login" class="self-center min-h-11 flex items-center text-[13px] underline underline-offset-2" style="color:var(--text-light)"
        data-testid="guest-tile-login">{{ 'daily.guestTile.haveAccount' | translate }}</a>
    </section>
  `,
})
export class GuestAccountTileComponent {
  readonly kind = input.required<GuestTileKind>();
  /** La série à dire (série perdue, ou série en cours). */
  readonly streak = input(0);
  readonly dismissed = output<void>();

  protected readonly titleKey = computed(() =>
    this.kind() === 'lost' ? `daily.guestTile.lost.title.${pluralKey(this.streak())}` : `daily.guestTile.${this.kind()}.title`);
  protected readonly icon = computed<StreakIconName>(() => {
    switch (this.kind()) {
      case 'lost': return 'heart-crack';
      case 'freezeMiss': return 'snowflake';
      default: return 'flame';
    }
  });
  protected readonly iconColor = computed(() => (this.kind() === 'freezeMiss' ? 'var(--color-accent-2)' : 'var(--color-accent-3)'));
}

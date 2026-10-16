import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Badge officiel « À écouter sur Deezer » (lien vers le morceau). Sans identifiant, rien n'est affiché. */
@Component({
  selector: 'app-deezer-badge',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deezer-badge.component.html',
})
export class DeezerBadgeComponent {
  readonly deezerTrackId = input<number | undefined>();
  readonly variant = input<'horizontal' | 'vertical'>('horizontal');
  readonly width = input('196');
  readonly height = input('28');
  /** Langue du badge (le visuel officiel existe en français et en anglais). */
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly href = computed(() =>
    this.deezerTrackId() != null ? `https://www.deezer.com/track/${this.deezerTrackId()}` : null,
  );
  protected readonly isEn = computed(() => this.lang() === 'en');
}

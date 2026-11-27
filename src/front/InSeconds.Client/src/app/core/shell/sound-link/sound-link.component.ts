import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SoundToggleComponent } from '../../../ui/sound-toggle/sound-toggle.component';
import { SoundService } from '../../sound/sound.service';

/** Le rond « Bruitages » de l'en-tête de l'accueil, à côté des accès du compte et du rond Instagram. */
@Component({
  selector: 'app-sound-link',
  imports: [SoundToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-sound-toggle [ringed]="true" [enabled]="sounds.enabled()" (toggled)="sounds.setEnabled(!sounds.enabled())" />`,
  host: { style: 'display:contents' },
})
export class SoundLinkComponent {
  protected readonly sounds = inject(SoundService);
}

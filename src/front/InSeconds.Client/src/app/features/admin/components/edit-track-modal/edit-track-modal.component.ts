import { Component, ElementRef, HostListener, effect, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService } from '../../services/admin-pool.service';

@Component({
  selector: 'app-edit-track-modal',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-track-modal.component.html',
})
export class EditTrackModalComponent {
  protected readonly pool = inject(AdminPoolService);

  private readonly artistInput = viewChild<ElementRef<HTMLInputElement>>('artistInput');

  constructor() {
    // Focus sur le champ Artiste à l'ouverture : saisie directe au clavier.
    effect(() => this.artistInput()?.nativeElement.focus());
  }

  // Échap ferme la modale où que soit le focus (le (keydown.escape) du <dialog> ne se
  // déclenche que si le focus est déjà dedans, ce qui n'est pas le cas juste après l'ouverture).
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.pool.editModalTrack()) this.pool.closeEditModal();
  }
}

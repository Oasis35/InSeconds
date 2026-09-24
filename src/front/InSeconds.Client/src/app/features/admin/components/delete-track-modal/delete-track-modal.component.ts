import { Component, HostListener, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService } from '../../services/admin-pool.service';

@Component({
  selector: 'app-delete-track-modal',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delete-track-modal.component.html',
})
export class DeleteTrackModalComponent {
  protected readonly pool = inject(AdminPoolService);

  // Échap ferme la modale où que soit le focus (le (keydown.escape) du <dialog> ne se
  // déclenche que si le focus est déjà dedans, ce qui n'est pas le cas juste après l'ouverture).
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.pool.deleteModalOpen()) this.pool.closeDeleteModal();
  }
}

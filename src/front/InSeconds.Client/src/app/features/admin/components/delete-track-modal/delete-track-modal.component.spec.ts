import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DeleteTrackModalComponent } from './delete-track-modal.component';
import { AdminPoolService } from '../../services/admin-pool.service';

// Même approche que edit-track-modal.component.spec.ts : pas de fixture (pas besoin de TranslateService).
describe('DeleteTrackModalComponent', () => {
  let component: DeleteTrackModalComponent;
  let open: ReturnType<typeof signal<boolean>>;
  let close: jasmine.Spy;

  beforeEach(() => {
    open = signal(false);
    close = jasmine.createSpy('closeDeleteModal');
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminPoolService, useValue: { deleteModalOpen: open, closeDeleteModal: close } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new DeleteTrackModalComponent());
  });

  it('Échap ferme la modale quand elle est ouverte', () => {
    open.set(true);
    component['onEscape']();
    expect(close).toHaveBeenCalled();
  });

  it('Échap ne fait rien quand la modale est fermée', () => {
    component['onEscape']();
    expect(close).not.toHaveBeenCalled();
  });
});

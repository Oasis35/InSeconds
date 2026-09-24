import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EditTrackModalComponent } from './edit-track-modal.component';
import { AdminPoolService } from '../../services/admin-pool.service';
import { PoolTrackDto } from '../../admin.models';

// Même approche que challenges-tab.component.spec.ts : pas de fixture (pas besoin de TranslateService).
describe('EditTrackModalComponent', () => {
  let component: EditTrackModalComponent;
  let editModalTrack: ReturnType<typeof signal<PoolTrackDto | null>>;
  let closeEditModal: jasmine.Spy;

  beforeEach(() => {
    editModalTrack = signal<PoolTrackDto | null>(null);
    closeEditModal = jasmine.createSpy('closeEditModal');
    TestBed.configureTestingModule({
      providers: [{ provide: AdminPoolService, useValue: { editModalTrack, closeEditModal } }],
    });
    component = TestBed.runInInjectionContext(() => new EditTrackModalComponent());
  });

  it('Échap ferme la modale quand elle est ouverte', () => {
    editModalTrack.set({ id: 1, artist: 'A', title: 'T', deezerTrackId: 1 });
    component['onEscape']();
    expect(closeEditModal).toHaveBeenCalled();
  });

  it('Échap ne fait rien quand la modale est fermée', () => {
    component['onEscape']();
    expect(closeEditModal).not.toHaveBeenCalled();
  });
});

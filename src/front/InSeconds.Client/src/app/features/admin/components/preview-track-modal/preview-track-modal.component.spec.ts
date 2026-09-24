import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PreviewTrackModalComponent } from './preview-track-modal.component';
import { AdminPoolService } from '../../services/admin-pool.service';
import { PoolAudioPreviewService } from '../../services/pool-audio-preview.service';

// Même approche que edit-track-modal.component.spec.ts : pas de fixture (pas besoin de TranslateService).
describe('PreviewTrackModalComponent', () => {
  let component: PreviewTrackModalComponent;
  let open: ReturnType<typeof signal<boolean>>;
  let close: jasmine.Spy;

  beforeEach(() => {
    open = signal(false);
    close = jasmine.createSpy('closePreviewModal');
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminPoolService, useValue: { previewModalOpen: open, closePreviewModal: close } },
        { provide: PoolAudioPreviewService, useValue: {} },
      ],
    });
    component = TestBed.runInInjectionContext(() => new PreviewTrackModalComponent());
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

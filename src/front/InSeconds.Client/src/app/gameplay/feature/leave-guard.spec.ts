import { Subject } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../ui/modal/confirm-dialog.component';
import { ModalService } from '../../ui/modal/modal.service';
import { LeaveGuard } from './leave-guard';

const DATA: ConfirmDialogData = { title: 'Quitter ?', body: 'La partie est en cours.', confirmLabel: 'Quitter', cancelLabel: 'Rester', tone: 'danger' };

/** Une fenêtre simulée : se ferme avec le résultat donné, comme `DialogRef.close`. */
function fakeDialog(deferred = false) {
  const closed = new Subject<boolean | undefined>();
  const emit = (result?: boolean) => { closed.next(result); closed.complete(); };
  // `deferred` : la fermeture n'est annoncée qu'au tour suivant (une animation de sortie), après une éventuelle seconde demande.
  const close = vi.fn((result?: boolean) => (deferred ? queueMicrotask(() => emit(result)) : emit(result)));
  return { closed, close };
}

describe('LeaveGuard', () => {
  function setup(deferred = false) {
    const dialogs: ReturnType<typeof fakeDialog>[] = [];
    const modal = {
      openSheet: vi.fn(() => {
        const dialog = fakeDialog(deferred);
        dialogs.push(dialog);
        return dialog;
      }),
    };
    return { guard: new LeaveGuard(modal as unknown as ModalService), modal, dialogs };
  }

  it('ouvre la confirmation en panneau bas, avec ses textes', () => {
    const { guard, modal } = setup();

    void guard.confirm(DATA);

    expect(modal.openSheet).toHaveBeenCalledWith(ConfirmDialogComponent, { data: DATA });
  });

  it('confirmer la sortie rend vrai', async () => {
    const { guard, dialogs } = setup();
    const result = guard.confirm(DATA);

    dialogs[0].close(true);

    expect(await result).toBe(true);
  });

  it('annuler garde le joueur : faux', async () => {
    const { guard, dialogs } = setup();
    const result = guard.confirm(DATA);

    dialogs[0].close(false);

    expect(await result).toBe(false);
  });

  it('fermer la fenêtre sans choisir (Échap, fond) ne laisse pas partir', async () => {
    const { guard, dialogs } = setup();
    const result = guard.confirm(DATA);

    dialogs[0].close(undefined);

    expect(await result).toBe(false);
  });

  it('une seconde demande ferme la première sans la laisser partir, et ne résout que par sa propre réponse', async () => {
    const { guard, dialogs } = setup();
    const first = guard.confirm(DATA);
    const second = guard.confirm(DATA);

    expect(dialogs[0].close).toHaveBeenCalledWith(false);
    expect(await first).toBe(false);
    dialogs[1].close(true);
    expect(await second).toBe(true);
  });

  it('la fermeture tardive de la première fenêtre ne fait pas oublier la seconde : la libération la ferme bien', async () => {
    const { guard, dialogs } = setup(true);
    const first = guard.confirm(DATA);
    const second = guard.confirm(DATA);
    // La fermeture de la première arrive maintenant, après que la seconde est posée.
    await first;

    guard.release();

    expect(dialogs[1].close).toHaveBeenCalledWith(true);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
  });

  it('plus de partie à protéger : la fenêtre ouverte se ferme en laissant partir', async () => {
    const { guard, dialogs } = setup();
    const result = guard.confirm(DATA);

    guard.release();

    expect(dialogs[0].close).toHaveBeenCalledWith(true);
    expect(await result).toBe(true);
  });

  it('sans fenêtre ouverte, la libération ne fait rien, avant comme après une réponse', async () => {
    const { guard, dialogs } = setup();

    expect(() => guard.release()).not.toThrow();

    const result = guard.confirm(DATA);
    dialogs[0].close(false);
    await result;
    dialogs[0].close.mockClear();
    guard.release();
    expect(dialogs[0].close).not.toHaveBeenCalled();
  });
});

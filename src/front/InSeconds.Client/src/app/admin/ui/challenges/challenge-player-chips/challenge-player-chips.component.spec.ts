import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ChallengePlayer, shortId } from '../../../domain/challenge';
import { ChallengePlayerChipsComponent } from './challenge-player-chips.component';

const alice: ChallengePlayer = { playerId: 'aaaaaaaa-1111-4222-8333-444444444444', status: 'Completed', score: 2410, pseudo: 'Alice' };
const guest: ChallengePlayer = { playerId: 'bbbbbbbb-1111-4222-8333-444444444444', status: 'Abandoned', score: 0, pseudo: null };
const pending: ChallengePlayer = { playerId: 'cccccccc-1111-4222-8333-444444444444', status: 'Pending', score: 0, pseudo: null };

describe('ChallengePlayerChipsComponent', () => {
  function render(players: readonly ChallengePlayer[], inputs: Partial<{ youId: string | null; highlightedId: string | null; copiedId: string | null }> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ChallengePlayerChipsComponent);
    fixture.componentRef.setInput('players', players);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    const selected = vi.fn();
    const copied = vi.fn();
    fixture.componentInstance.playerSelected.subscribe(selected);
    fixture.componentInstance.playerCopied.subscribe(copied);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const chips = () => Array.from(element.querySelectorAll<HTMLButtonElement>('button'));
    return { fixture, element, chips, selected, copied, text: (i: number) => chips()[i].textContent!.replace(/\s+/g, ' ').trim() };
  }

  it('un chip par joueur : le pseudo d\'un compte, sinon les huit premiers caractères de l\'identifiant', () => {
    const { chips, text } = render([alice, guest]);

    expect(chips()).toHaveLength(2);
    expect(text(0)).toBe('Alice');
    expect(text(1)).toBe(shortId(guest.playerId));
    expect(text(1)).toHaveLength(8);
  });

  it('aucun joueur : aucun chip', () => {
    expect(render([]).chips()).toHaveLength(0);
  });

  it('le joueur de ce navigateur porte « toi », pas les autres', () => {
    const { text } = render([alice, guest], { youId: alice.playerId });

    expect(text(0)).toContain('admin.dashboard.you');
    expect(text(1)).not.toContain('admin.dashboard.you');
  });

  it('une partie qui n\'est pas terminée a un point de statut, une partie terminée non', () => {
    const { chips } = render([alice, guest, pending]);

    expect(chips()[0].querySelector('.rounded-full')).toBeNull();
    expect(chips()[1].querySelector('.rounded-full')).not.toBeNull();
    expect(chips()[2].querySelector('.rounded-full')).not.toBeNull();
  });

  it('le point d\'une partie abandonnée n\'a pas la couleur d\'une partie en cours', () => {
    const { chips } = render([guest, pending]);

    expect(chips()[0].querySelector<HTMLElement>('.rounded-full')!.style.background).toBe('var(--color-warn)');
    expect(chips()[1].querySelector<HTMLElement>('.rounded-full')!.style.background).toBe('var(--text-faint)');
  });

  it('l\'infobulle donne l\'identifiant complet et le statut, plus le score d\'une partie terminée seulement', () => {
    const { chips } = render([alice, guest]);

    expect(chips()[0].title).toContain(alice.playerId);
    expect(chips()[0].title).toContain('2410 pts');
    expect(chips()[1].title).toContain(guest.playerId);
    expect(chips()[1].title).not.toContain('pts');
  });

  it('un statut inconnu s\'affiche tel quel dans l\'infobulle', () => {
    expect(render([{ ...alice, status: 'Mystère' }]).chips()[0].title).toContain('Mystère');
  });

  it('le clic gauche émet l\'identifiant, pour la surbrillance croisée', () => {
    const { chips, selected, copied } = render([alice, guest]);

    chips()[1].click();

    expect(selected).toHaveBeenCalledWith(guest.playerId);
    expect(copied).not.toHaveBeenCalled();
  });

  it('le clic droit demande la copie de l\'identifiant, sans ouvrir le menu du navigateur ni sélectionner', () => {
    const { chips, selected, copied } = render([alice]);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    chips()[0].dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(copied).toHaveBeenCalledWith(alice.playerId);
    expect(selected).not.toHaveBeenCalled();
  });

  it('le chip copié dit « copié » à la place de son pseudo, les autres gardent le leur', () => {
    const { text } = render([alice, guest], { copiedId: alice.playerId });

    expect(text(0)).toBe('admin.dashboard.copied');
    expect(text(1)).toBe(shortId(guest.playerId));
  });

  it('le joueur surligné garde tout son éclat, les autres s\'estompent', () => {
    const { chips } = render([alice, guest], { highlightedId: alice.playerId });

    expect(chips()[0].style.opacity).toBe('');
    expect(chips()[0].style.boxShadow).not.toBe('');
    expect(chips()[1].style.opacity).toBe('0.3');
    expect(chips()[1].style.boxShadow).toBe('');
  });

  it('sans surbrillance, personne n\'est estompé', () => {
    const { chips } = render([alice, guest], { highlightedId: null });

    expect(chips().map(chip => chip.style.opacity)).toEqual(['', '']);
  });
});

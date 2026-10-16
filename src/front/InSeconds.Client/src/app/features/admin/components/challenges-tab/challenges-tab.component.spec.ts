import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ChallengesTabComponent } from './challenges-tab.component';
import { AdminStatsService } from '../../services/admin-stats.service';
import { PlayerSessionService } from '../../../../core/services/player-session.service';
import { ClipboardService } from '../../../../core/services/clipboard.service';

const DEV_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

describe('ChallengesTabComponent', () => {
  let component: ChallengesTabComponent;
  let identityStub: {
    playerId: ReturnType<typeof signal<string | null>>;
  };
  let clipboardStub: {
    copy: Mock;
  };

  beforeEach(() => {
    identityStub = { playerId: signal<string | null>(DEV_ID) };
    clipboardStub = { copy: vi.fn().mockName('copy').mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        // `challengeMonth` : lu par l'effect du constructeur (reset de la surbrillance au changement de mois).
        { provide: AdminStatsService, useValue: { challengeMonth: signal('2026-08') } },
        { provide: PlayerSessionService, useValue: identityStub },
        { provide: ClipboardService, useValue: clipboardStub },
      ],
    });

    component = TestBed.runInInjectionContext(() => new ChallengesTabComponent());
  });

  describe('shortId()', () => {
    it('returns the first 8 characters of the player id', () => {
      expect(component['shortId'](DEV_ID)).toBe('aaaaaaaa');
    });
  });

  describe('isYou()', () => {
    it('returns true when the id matches the browser identity', () => {
      expect(component['isYou'](DEV_ID)).toBe(true);
    });

    it('returns false when the id does not match', () => {
      expect(component['isYou']('bbbbbbbb-0000-0000-0000-000000000002')).toBe(false);
    });

    it('returns false while the browser identity is not yet loaded', () => {
      identityStub.playerId.set(null);
      expect(component['isYou'](DEV_ID)).toBe(false);
    });
  });

  describe('chipTitle()', () => {
    it('includes the score when the player completed the challenge', () => {
      expect(component['chipTitle']({ playerId: DEV_ID, status: 'Completed', score: 1175 } as never))
        .toBe(`${DEV_ID} — Completed — 1175 pts`);
    });

    it('omits the score otherwise', () => {
      expect(component['chipTitle']({ playerId: DEV_ID, status: 'Abandoned', score: 0 } as never))
        .toBe(`${DEV_ID} — Abandoned`);
    });
  });

  describe('statusColor()', () => {
    it('returns amber for Abandoned', () => {
      expect(component['statusColor']('Abandoned')).toBe('var(--bg-warn)');
    });

    it('returns muted grey for Expired', () => {
      expect(component['statusColor']('Expired')).toBe('var(--text-muted)');
    });

    it('returns faint for Pending', () => {
      expect(component['statusColor']('Pending')).toBe('var(--text-faint)');
    });
  });

  describe('idHue() / chipColors()', () => {
    it('is deterministic for a given id', () => {
      expect(component['idHue'](DEV_ID)).toBe(component['idHue'](DEV_ID));
    });

    it('produces a hue in [0, 360)', () => {
      const hue = component['idHue'](DEV_ID);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('gives different hues to different ids', () => {
      expect(component['idHue']('be61aa01-0000-0000-0000-000000000000'))
        .not.toBe(component['idHue']('138b0dbe-0000-0000-0000-000000000000'));
    });

    it('chipColors() embeds the hue and is memoised (same object on repeat calls)', () => {
      const hue = component['idHue'](DEV_ID);
      const c = component['chipColors'](DEV_ID);
      expect(c.bg).toContain(`hsl(${hue}`);
      expect(component['chipColors'](DEV_ID)).toBe(c);
    });
  });

  describe('selectPlayer() / highlight', () => {
    const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

    it('highlights the clicked id, dims the others', () => {
      component['selectPlayer'](DEV_ID);
      expect(component['isHighlighted'](DEV_ID)).toBe(true);
      expect(component['isDimmed'](DEV_ID)).toBe(false);
      expect(component['isDimmed'](OTHER)).toBe(true);
      expect(component['isHighlighted'](OTHER)).toBe(false);
    });

    it('toggles off when the same id is clicked again', () => {
      component['selectPlayer'](DEV_ID);
      component['selectPlayer'](DEV_ID);
      expect(component['highlightedPlayerId']()).toBeNull();
      expect(component['isDimmed'](OTHER)).toBe(false);
    });

    it('switches highlight when a different id is clicked', () => {
      component['selectPlayer'](DEV_ID);
      component['selectPlayer'](OTHER);
      expect(component['isHighlighted'](OTHER)).toBe(true);
      expect(component['isDimmed'](DEV_ID)).toBe(true);
    });

    it('nothing is dimmed when no id is selected', () => {
      expect(component['isDimmed'](DEV_ID)).toBe(false);
      expect(component['isDimmed'](OTHER)).toBe(false);
    });
  });

  describe('onChipContextMenu() → copy', () => {
    it('prevents the default menu and copies the full id', async () => {
      const evt = { preventDefault: vi.fn().mockName('preventDefault') } as unknown as MouseEvent;
      component['onChipContextMenu'](evt, DEV_ID);
      await Promise.resolve();

      expect(evt.preventDefault).toHaveBeenCalled();
      expect(clipboardStub.copy).toHaveBeenCalledWith(DEV_ID);
      expect(component['copiedPlayerId']()).toBe(DEV_ID);
    });
  });

  describe('copyPlayerId()', () => {
    it('sets copiedPlayerId to the copied id on success', async () => {
      component['copyPlayerId'](DEV_ID);
      await Promise.resolve();

      expect(clipboardStub.copy).toHaveBeenCalledWith(DEV_ID);
      expect(component['copiedPlayerId']()).toBe(DEV_ID);
    });

    it('does not set copiedPlayerId when the copy fails', async () => {
      clipboardStub.copy.mockResolvedValue(false);

      component['copyPlayerId'](DEV_ID);
      await Promise.resolve();

      expect(component['copiedPlayerId']()).toBeNull();
    });
  });

  describe('pop-up histogramme', () => {
    const track = { position: 1, artist: 'Eminem', title: 'Lose Yourself' } as never;

    // Échap et le fond cliquable passent par ModalComponent, qui appelle closeChart().
    it('openChart() stores the track, closeChart() clears it', () => {
      expect(component['chartTrack']()).toBeNull();

      component['openChart'](track);
      expect(component['chartTrack']()).toBe(track);

      component['closeChart']();
      expect(component['chartTrack']()).toBeNull();
    });
  });
});

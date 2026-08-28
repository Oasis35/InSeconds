import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ChallengesTabComponent } from './challenges-tab.component';
import { AdminStatsService } from '../../services/admin-stats.service';
import { PlayerIdentityService } from '../../../../core/services/player-identity.service';
import { ClipboardService } from '../../../../core/services/clipboard.service';

const DEV_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

describe('ChallengesTabComponent', () => {
  let component: ChallengesTabComponent;
  let identityStub: { playerId: ReturnType<typeof signal<string | null>> };
  let clipboardStub: { copy: jasmine.Spy };

  beforeEach(() => {
    identityStub = { playerId: signal<string | null>(DEV_ID) };
    clipboardStub = { copy: jasmine.createSpy('copy').and.returnValue(Promise.resolve(true)) };

    TestBed.configureTestingModule({
      providers: [
        // `challengeMonth` : lu par l'effect du constructeur (reset de la surbrillance au changement de mois).
        { provide: AdminStatsService, useValue: { challengeMonth: signal('2026-08') } },
        { provide: PlayerIdentityService, useValue: identityStub },
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
      expect(component['isYou'](DEV_ID)).toBeTrue();
    });

    it('returns false when the id does not match', () => {
      expect(component['isYou']('bbbbbbbb-0000-0000-0000-000000000002')).toBeFalse();
    });

    it('returns false while the browser identity is not yet loaded', () => {
      identityStub.playerId.set(null);
      expect(component['isYou'](DEV_ID)).toBeFalse();
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
      expect(component['isHighlighted'](DEV_ID)).toBeTrue();
      expect(component['isDimmed'](DEV_ID)).toBeFalse();
      expect(component['isDimmed'](OTHER)).toBeTrue();
      expect(component['isHighlighted'](OTHER)).toBeFalse();
    });

    it('toggles off when the same id is clicked again', () => {
      component['selectPlayer'](DEV_ID);
      component['selectPlayer'](DEV_ID);
      expect(component['highlightedPlayerId']()).toBeNull();
      expect(component['isDimmed'](OTHER)).toBeFalse();
    });

    it('switches highlight when a different id is clicked', () => {
      component['selectPlayer'](DEV_ID);
      component['selectPlayer'](OTHER);
      expect(component['isHighlighted'](OTHER)).toBeTrue();
      expect(component['isDimmed'](DEV_ID)).toBeTrue();
    });

    it('nothing is dimmed when no id is selected', () => {
      expect(component['isDimmed'](DEV_ID)).toBeFalse();
      expect(component['isDimmed'](OTHER)).toBeFalse();
    });
  });

  describe('onChipContextMenu() → copy', () => {
    it('prevents the default menu and copies the full id', async () => {
      const evt = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as MouseEvent;
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
      clipboardStub.copy.and.returnValue(Promise.resolve(false));

      component['copyPlayerId'](DEV_ID);
      await Promise.resolve();

      expect(component['copiedPlayerId']()).toBeNull();
    });
  });
});

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
        { provide: AdminStatsService, useValue: {} },
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

  describe('statusBg() / statusColor()', () => {
    it('returns the amber styling for Abandoned', () => {
      expect(component['statusBg']('Abandoned')).toBe('rgba(251,191,36,0.1)');
      expect(component['statusColor']('Abandoned')).toBe('var(--bg-warn)');
    });

    it('returns the neutral styling for Pending', () => {
      expect(component['statusBg']('Pending')).toBe('var(--bg-inactive)');
      expect(component['statusColor']('Pending')).toBe('var(--text-faint)');
    });

    it('returns the default styling for Completed', () => {
      expect(component['statusBg']('Completed')).toBe('var(--bg-surface-2)');
      expect(component['statusColor']('Completed')).toBe('var(--text-muted)');
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

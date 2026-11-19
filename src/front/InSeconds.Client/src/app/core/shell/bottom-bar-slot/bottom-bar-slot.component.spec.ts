import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ErrorReportingService } from '../../errors/error-reporting.service';
import { BOTTOM_BAR_SLOT } from './bottom-bar-slot';
import { BottomBarSlotComponent } from './bottom-bar-slot.component';

@Component({ selector: 'app-fake-bar', template: '<nav data-testid="fake-bar"></nav>' })
class FakeBar {}

describe('BottomBarSlotComponent', () => {
  it('charge la barre à la demande, pour tout le monde', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: BOTTOM_BAR_SLOT, useValue: { load: async () => FakeBar } }] });
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    expect((fixture.nativeElement as HTMLElement).parentElement?.querySelector('[data-testid="fake-bar"]')).not.toBeNull();
  });

  it("une barre qui ne se charge pas est remontée en avertissement", async () => {
    const report = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: BOTTOM_BAR_SLOT, useValue: { load: () => Promise.reject(new Error('réseau')) } },
      { provide: ErrorReportingService, useValue: { report } },
    ] });
    const fixture = TestBed.createComponent(BottomBarSlotComponent);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning' }));
  });
});

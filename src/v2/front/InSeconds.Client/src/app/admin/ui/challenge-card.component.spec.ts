import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { challengePlayer, challengeStats } from '../data-access/testing/fake-challenges-api';
import { ChallengeCardComponent } from './challenge-card.component';

describe('ChallengeCardComponent', () => {
  let fixture: ComponentFixture<ChallengeCardComponent>;
  const element = () => fixture.nativeElement as HTMLElement;

  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    fixture = TestBed.createComponent(ChallengeCardComponent);
    fixture.componentRef.setInput('challenge', challengeStats({
      date: '2026-10-05', players: [challengePlayer({ playerId: 'aaaaaaaa-1' }), challengePlayer({ playerId: 'bbbbbbbb-2' })],
    }));
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
  }

  it('est un bloc py-3 repérable par sa date, dont le premier bouton est l\'accordéon', () => {
    render();

    const root = element().querySelector('div.py-3')!;
    expect(root.textContent).toContain('2026-10-05');
    expect(root.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('émet toggle au clic sur l\'en-tête', () => {
    render();
    const toggle = vi.fn();
    fixture.componentInstance.toggle.subscribe(toggle);

    element().querySelector('button')!.click();

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('cache le détail replié, le montre déplié', () => {
    render();
    expect(element().querySelector('app-challenge-track-stats')).toBeNull();

    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();

    expect(element().querySelectorAll('app-challenge-track-stats')).toHaveLength(1);
  });

  it('indique le nombre d\'abandons (abandons + inachevés) au pluriel', () => {
    render({ challenge: challengeStats({ abandonedCount: 1, expiredCount: 2 }) });

    expect(element().textContent).toContain('3 admin.dashboard.abandons');
  });

  it('propose le recalcul sur un défi qui le permet, avec l\'état « en cours » et l\'erreur', () => {
    render({
      challenge: challengeStats({ canRecompute: true, computedAt: '2026-10-06T00:05:00Z' }),
      expanded: true, recomputeErrorKey: 'admin.challenges.recomputeNotOver',
    });
    const recompute = vi.fn();
    fixture.componentInstance.recompute.subscribe(recompute);

    const button = Array.from(element().querySelectorAll('button')).find(b => b.textContent?.includes('admin.challenges.recompute'))!;
    button.click();

    expect(recompute).toHaveBeenCalledWith('2026-10-05');
    expect(element().querySelector('[role="alert"]')?.textContent).toContain('admin.challenges.recomputeNotOver');

    fixture.componentRef.setInput('recomputing', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });

  it('ne propose pas le recalcul quand le défi ne le permet pas', () => {
    render({ expanded: true });

    expect(Array.from(element().querySelectorAll('button')).some(b => b.textContent?.includes('admin.challenges.recompute'))).toBe(false);
    expect(element().querySelector('[data-testid="challenge-computed-at"]')).toBeNull();
  });
});

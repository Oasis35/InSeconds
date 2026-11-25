import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StreakEventLineComponent } from './streak-event-line.component';

function render(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(StreakEventLineComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('StreakEventLineComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideTranslateService()] }));

  it('gel gagné : la clé du gain et la série, sans bouton ni lien', () => {
    const el = render({ kind: 'earned', streak: 7 });
    const text = el.textContent ?? '';
    expect(text).toContain('daily.streakEvent.earned');
    expect(text).toContain('daily.streakEvent.earnedDetail');
    expect(el.querySelector('button, a')).toBeNull();
  });

  it('gel gagné sans série connue : pas de détail', () => {
    expect(render({ kind: 'earned' }).textContent).not.toContain('earnedDetail');
  });

  it('gels utilisés : singulier pour un, pluriel au-delà', () => {
    expect(render({ kind: 'used', freezesUsed: 1 }).textContent).toContain('daily.streakEvent.used.one');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    expect(render({ kind: 'used', freezesUsed: 2 }).textContent).toContain('daily.streakEvent.used.other');
  });
});

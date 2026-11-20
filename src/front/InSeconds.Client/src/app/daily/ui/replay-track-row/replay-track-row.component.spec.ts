import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { REPLAY_PAGE } from '../../data-access/testing/fake-daily-api';
import { ReplayTrackRowComponent } from './replay-track-row.component';

describe('ReplayTrackRowComponent', () => {
  function render(index = 0) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ReplayTrackRowComponent);
    fixture.componentRef.setInput('track', REPLAY_PAGE().days[0].tracks[index]);
    fixture.detectChanges();
    return fixture;
  }

  it('dit ce qui a été raté', () => {
    expect(render(0).nativeElement.querySelector('[data-testid="replay-miss"]').textContent).toBe('daily.replay.miss.nothing');
    TestBed.resetTestingModule();
    expect(render(1).nativeElement.querySelector('[data-testid="replay-miss"]').textContent).toBe('daily.replay.miss.title');
  });

  it("le rond d'écoute demande l'extrait, et passe en pause quand il joue", () => {
    const fixture = render();
    const listen = vi.fn();
    fixture.componentInstance.listen.subscribe(listen);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="replay-listen"]')!;

    button.click();
    expect(listen).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('playing', true);
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('daily.archive.pause');
  });
});

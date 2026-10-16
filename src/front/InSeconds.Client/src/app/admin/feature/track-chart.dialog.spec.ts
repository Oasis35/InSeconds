import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { challengeTrack } from '../data-access/testing/fake-challenges-api';
import { TrackChartDialog } from './track-chart.dialog';

describe('TrackChartDialog', () => {
  function open() {
    const track = challengeTrack({
      position: 2, artist: 'Eminem', title: 'Lose Yourself', notFoundCount: 3,
      guessTimeDistribution: [{ seconds: 0.5, count: 4 }, { seconds: 1, count: 0 }, { seconds: 2, count: 7 }],
    });
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: DIALOG_DATA, useValue: { track } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(TrackChartDialog);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('titre la fenêtre avec le morceau', () => {
    const element = open();

    expect(element.textContent).toContain('2. Eminem — Lose Yourself');
    expect(element.textContent).toContain('admin.challenges.guessTimeTitle');
  });

  it('montre une barre par palier plus la barre « ✗ », avec les chiffres au-dessus', () => {
    const element = open();

    const buckets = Array.from(element.querySelectorAll('[data-testid="guess-time-chart"] [data-bucket]'));
    expect(buckets.map(b => b.getAttribute('data-bucket'))).toEqual(['d0.5', 'd1', 'd2', 'nf']);
    expect(buckets.map(b => b.querySelector('span')?.textContent?.trim())).toEqual(['4', '0', '7', '3']);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ShareButtonComponent } from './share-button.component';

describe('ShareButtonComponent', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ShareButtonComponent);
    fixture.componentRef.setInput('copied', false);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  it('émet « share » au clic', () => {
    const fixture = render({});
    const emitted = vi.fn();
    fixture.componentInstance.share.subscribe(emitted);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('désactive le bouton quand « disabled »', () => {
    const fixture = render({ disabled: true });
    expect((fixture.nativeElement as HTMLElement).querySelector('button')!.disabled).toBe(true);
  });

  it('affiche le message d’échec seulement quand « failed »', () => {
    expect((render({}).nativeElement as HTMLElement).querySelector('p')).toBeNull();
  });

  it('affiche le message d’échec quand « failed »', () => {
    TestBed.resetTestingModule();
    expect((render({ failed: true }).nativeElement as HTMLElement).querySelector('p')).not.toBeNull();
  });

  it('un mode donne ses propres libellés ; ceux du Daily sont les défauts', () => {
    const daily = render({}).nativeElement as HTMLElement;
    expect(daily.querySelector('button')!.textContent).toContain('daily.share.button');

    TestBed.resetTestingModule();
    const runs = render({ labelKey: 'runs.finished.share', copiedKey: 'runs.finished.shareCopied', failedKey: 'runs.finished.shareFailed', failed: true }).nativeElement as HTMLElement;
    expect(runs.querySelector('button')!.textContent).toContain('runs.finished.share');
    expect(runs.querySelector('p')!.textContent).toContain('runs.finished.shareFailed');

    TestBed.resetTestingModule();
    const copied = render({ labelKey: 'runs.finished.share', copiedKey: 'runs.finished.shareCopied', copied: true }).nativeElement as HTMLElement;
    expect(copied.querySelector('button')!.textContent).toContain('runs.finished.shareCopied');
  });
});

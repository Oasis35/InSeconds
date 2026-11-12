import { Type, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

/** Monte un composant hôte de test et donne de quoi cliquer par `data-testid`. */
export function renderHost<T>(host: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const click = (testId: string) => {
    (element.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
    fixture.detectChanges();
  };
  return { fixture, element, host: fixture.componentInstance, click };
}

/** Joue une action en attente qui se termine, avec le refus donné (ou sans). */
export function finishPending(
  fixture: { detectChanges(): void },
  host: { pending: WritableSignal<boolean>; errorKey: WritableSignal<string | null> },
  errorKey: string | null,
): void {
  host.pending.set(true);
  fixture.detectChanges();
  host.pending.set(false);
  host.errorKey.set(errorKey);
  fixture.detectChanges();
}

import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunNextButtonComponent } from './run-next-button.component';

describe('RunNextButtonComponent', () => {
  function render(inputs: { endsRun?: boolean; auto?: boolean } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunNextButtonComponent);
    fixture.componentRef.setInput('endsRun', inputs.endsRun ?? false);
    fixture.componentRef.setInput('auto', inputs.auto ?? false);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('« Morceau suivant », ou « Voir le résultat » quand la partie est finie', () => {
    expect(render().element.textContent).toContain('Morceau suivant');
    TestBed.resetTestingModule();
    expect(render({ endsRun: true }).element.textContent).toContain('Voir le résultat');
  });

  it('le trait de l\'enchaînement automatique ne se remplit que s\'il est armé, sur 2 s', () => {
    expect(render().element.querySelector('.next-progress')).toBeNull();
    TestBed.resetTestingModule();
    const progress = render({ auto: true }).element.querySelector<HTMLElement>('.next-progress');
    expect(progress?.style.animationDuration).toBe('2000ms');
  });

  it('un toucher n\'attend pas', () => {
    const { fixture, element } = render({ auto: true });
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);

    element.querySelector('button')!.click();

    expect(next).toHaveBeenCalledTimes(1);
  });
});

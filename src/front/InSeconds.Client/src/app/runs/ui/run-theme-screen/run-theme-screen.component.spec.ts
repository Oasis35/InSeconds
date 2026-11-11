import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunThemeScreenComponent } from './run-theme-screen.component';

describe('RunThemeScreenComponent', () => {
  let fixture: ComponentFixture<RunThemeScreenComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const choice = (icon: string | null = null) => ({
    round: 3, themes: [{ id: 1, name: 'Années 80', round: 3, icon }, { id: 2, name: 'Rap français', round: 3, icon: null }],
  });
  const mysteryName = (): string => el().querySelector('[data-testid="run-theme-mystery-name"]')?.textContent?.trim() ?? '';

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    fixture = TestBed.createComponent(RunThemeScreenComponent);
    fixture.componentRef.setInput('choice', choice());
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('montre les deux thèmes et « Thème mystère » : jamais de choix « sans thème »', () => {
    expect(el().querySelectorAll('[data-theme-id]')).toHaveLength(3);
    expect(el().textContent).toContain('Années 80');
    expect(el().textContent).toContain('Rap français');
    expect(el().querySelector('[data-theme-id="mystery"]')).not.toBeNull();
    expect(el().textContent).toContain('runs.theme.mystery');
  });

  it("montre l'icône d'un thème qui en a une, rien pour les autres", () => {
    fixture.componentRef.setInput('choice', choice('music'));
    fixture.detectChanges();

    expect(el().querySelector('[data-theme-id="1"] svg')).not.toBeNull();
    expect(el().querySelector('[data-theme-id="2"] svg')).toBeNull();
  });

  it('un toucher choisit le thème, « Thème mystère » choisit sans thème (`null`)', () => {
    const chosen: (number | null)[] = [];
    fixture.componentInstance.choose.subscribe(v => chosen.push(v));

    (el().querySelector('[data-theme-id="2"]') as HTMLElement).click();
    (el().querySelector('[data-theme-id="mystery"]') as HTMLElement).click();

    expect(chosen).toEqual([2, null]);
  });

  it('un thème choisi éteint les autres lignes, rend la main après un court temps de lecture', () => {
    let revealed = 0;
    fixture.componentInstance.revealed.subscribe(() => revealed++);
    fixture.componentRef.setInput('picked', 1);
    fixture.componentRef.setInput('result', 'Années 80');
    fixture.detectChanges();

    expect(el().querySelector('[data-theme-id="1"]')?.classList).toContain('picked');
    expect(el().querySelector('[data-theme-id="2"]')?.classList).toContain('dim');
    expect(el().querySelector('[data-theme-id="mystery"]')?.classList).toContain('dim');
    expect(revealed).toBe(0);

    vi.advanceTimersByTime(400);

    expect(revealed).toBe(1);
  });

  it('le thème mystère « mouline » puis se pose sur le thème retenu par le serveur, qu\'on lit avant de continuer', () => {
    let revealed = 0;
    fixture.componentInstance.revealed.subscribe(() => revealed++);
    fixture.componentRef.setInput('picked', 'mystery');
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();

    expect(el().textContent).toContain('runs.theme.drawing');
    expect(mysteryName()).not.toBe('');
    expect(mysteryName()).not.toContain('runs.theme.mystery');

    fixture.componentRef.setInput('result', 'Rock 90');
    fixture.detectChanges();
    vi.advanceTimersByTime(1100);
    fixture.detectChanges();

    expect(mysteryName()).toBe('Rock 90');
    expect(revealed).toBe(0);

    vi.advanceTimersByTime(1100);

    expect(revealed).toBe(1);
  });

  it('un serveur lent : le tirage continue sans jamais s\'arrêter sur un faux thème', () => {
    fixture.componentRef.setInput('picked', 'mystery');
    fixture.detectChanges();

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(mysteryName()).not.toBe('Rock 90');
    expect(el().querySelector('[data-theme-id="mystery"]')?.classList).not.toContain('landed');
  });
});

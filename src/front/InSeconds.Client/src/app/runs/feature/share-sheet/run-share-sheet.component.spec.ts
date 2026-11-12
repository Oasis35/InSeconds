import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GroupsStore } from '../../../social/data-access/groups.store';
import { FakeSocialApi, GROUP, OTHER_GROUP, provideFakeSocialApi } from '../../../social/data-access/testing/fake-social-api';
import { RunShare } from '../../data-access/run-share';
import { RunFinish } from '../../domain/run';
import { RunShareSheetComponent, RunShareSheetData } from './run-share-sheet.component';

describe('RunShareSheetComponent', () => {
  const finish = { challengeCode: 'K7Q2M9', trackCount: 20 } as RunFinish;
  const data: RunShareSheetData = { finish, lang: 'fr', duel: { pseudo: 'Léa', gap: 126 } };
  let share: { shareScore: ReturnType<typeof vi.fn>; shareGrid: ReturnType<typeof vi.fn>; shareGroupInvite: ReturnType<typeof vi.fn> };
  let close: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(groups = [GROUP, OTHER_GROUP]) {
    const api = new FakeSocialApi();
    api.groups = { groups, maxGroups: 5 };
    share = { shareScore: vi.fn().mockResolvedValue(undefined), shareGrid: vi.fn().mockResolvedValue(undefined), shareGroupInvite: vi.fn().mockResolvedValue(undefined) };
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), provideFakeSocialApi(api), GroupsStore,
        { provide: RunShare, useValue: share }, { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RunShareSheetComponent);
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const click = (id: string, index = 0) => {
      el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)[index].click();
      fixture.detectChanges();
    };
    return { el, click };
  }

  it('« Défier un ami » partage le score (et le duel) puis ferme la feuille', async () => {
    const { click } = await render();

    click('share-challenge');

    expect(share.shareScore).toHaveBeenCalledWith(finish, 'fr', data.duel);
    expect(close).toHaveBeenCalled();
  });

  it('« Ma grille » partage le résultat seul', async () => {
    const { click } = await render();

    click('share-grid');

    expect(share.shareGrid).toHaveBeenCalledWith(finish, 'fr');
    expect(close).toHaveBeenCalled();
  });

  it('un seul groupe : l\'invitation part tout de suite', async () => {
    const { click } = await render([GROUP]);

    click('share-group');

    expect(share.shareGroupInvite).toHaveBeenCalledWith('K7Q2M9', GROUP);
    expect(close).toHaveBeenCalled();
  });

  it('plusieurs groupes : on choisit lequel, puis l\'invitation part', async () => {
    const { el, click } = await render();

    click('share-group');
    expect(share.shareGroupInvite).not.toHaveBeenCalled();
    expect(el.querySelectorAll('[data-testid="share-group-choice"]')).toHaveLength(2);

    click('share-group-choice', 1);
    expect(share.shareGroupInvite).toHaveBeenCalledWith('K7Q2M9', OTHER_GROUP);
    expect(close).toHaveBeenCalled();
  });

  it('sans groupe : « Créer un groupe et inviter » mène à la création', async () => {
    const { el, click } = await render([]);
    expect(el.querySelector('[data-testid="share-group"]')).toBeNull();

    click('share-create-group');

    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/ranking/new');
  });
});

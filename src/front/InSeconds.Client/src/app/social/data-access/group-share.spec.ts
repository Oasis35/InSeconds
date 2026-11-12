import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { ShareOutcome, ShareService } from '../../core/share/share.service';
import { GroupShare } from './group-share';

describe('GroupShare', () => {
  let shared: string[];
  let outcome: ShareOutcome;

  function create(): GroupShare {
    shared = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), GroupShare,
        { provide: ShareService, useValue: { share: (text: string) => { shared.push(text); return Promise.resolve(outcome); } } },
      ],
    });
    TestBed.inject(TranslateService).setTranslation('fr', { social: { invite: { text: 'Rejoins {{ name }}' } } });
    TestBed.inject(TranslateService).use('fr');
    return TestBed.inject(GroupShare);
  }

  it('partage une phrase avec le nom du groupe, puis le lien qui le fait rejoindre', async () => {
    outcome = 'copied';
    const share = create();

    await share.invite({ name: 'Potes', inviteCode: 'ABCD2345' });

    expect(shared[0].split('\n')[0]).toBe('Rejoins Potes');
    expect(shared[0].split('\n')[1]).toMatch(/\/ranking\/join\/ABCD2345\?utm_source=share$/);
    expect(share.copied()).toBe(true);
  });

  it('un échec se dit, un partage natif ou un menu fermé ne change rien', async () => {
    outcome = 'failed';
    const share = create();
    await share.invite({ name: 'Potes', inviteCode: 'ABCD2345' });
    expect(share.failed()).toBe(true);

    TestBed.resetTestingModule();
    outcome = 'shared';
    const native = create();
    await native.invite({ name: 'Potes', inviteCode: 'ABCD2345' });
    expect(native.copied()).toBe(false);
    expect(native.failed()).toBe(false);
  });
});

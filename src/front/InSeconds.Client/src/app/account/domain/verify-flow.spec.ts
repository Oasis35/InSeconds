import {
  BAD_REQUEST_CODE, INVALID_LINK_CODE, PSEUDO_TAKEN_CODE, afterFailure, afterVerified, chooseNewAccount, confirming, initialVerifyStep,
} from './verify-flow';

describe('verify-flow', () => {
  it('commence sur « lien incomplet » sans jeton, sinon attend le clic', () => {
    expect(initialVerifyStep(null)).toEqual({ kind: 'missing-token' });
    expect(initialVerifyStep('')).toEqual({ kind: 'missing-token' });
    expect(initialVerifyStep('abc')).toEqual({ kind: 'idle' });
  });

  it('annonce un nouveau compte à la première connexion, termine sinon', () => {
    expect(afterVerified({ needsPseudo: true, email: 'a@b.fr' })).toEqual({ kind: 'new-account', email: 'a@b.fr' });
    expect(afterVerified({ needsPseudo: false, email: null })).toEqual({ kind: 'done' });
    expect(confirming).toEqual({ kind: 'confirming' });
  });

  it('« Créer mon compte » mène au pseudo, seulement depuis « nouveau compte »', () => {
    expect(chooseNewAccount({ kind: 'new-account', email: 'a@b.fr' })).toEqual({ kind: 'needs-pseudo', problem: 'none' });
    expect(chooseNewAccount({ kind: 'idle' })).toEqual({ kind: 'idle' });
    expect(chooseNewAccount({ kind: 'done' })).toEqual({ kind: 'done' });
  });

  it('un lien refusé est définitivement invalide', () => {
    expect(afterFailure(INVALID_LINK_CODE, false)).toEqual({ kind: 'invalid-link' });
    expect(afterFailure(INVALID_LINK_CODE, true)).toEqual({ kind: 'invalid-link' });
  });

  it('un pseudo pris ou refusé ramène à l\'étape du pseudo', () => {
    expect(afterFailure(PSEUDO_TAKEN_CODE, true)).toEqual({ kind: 'needs-pseudo', problem: 'taken' });
    expect(afterFailure(BAD_REQUEST_CODE, true)).toEqual({ kind: 'needs-pseudo', problem: 'invalid' });
  });

  it('sans pseudo envoyé, une 400 ou un pseudo pris ne sont pas un problème de pseudo', () => {
    expect(afterFailure(BAD_REQUEST_CODE, false)).toEqual({ kind: 'failed' });
    expect(afterFailure(PSEUDO_TAKEN_CODE, false)).toEqual({ kind: 'failed' });
  });

  it('tout autre échec (réseau, serveur) laisse réessayer', () => {
    expect(afterFailure('common.network', false)).toEqual({ kind: 'failed' });
    expect(afterFailure('common.unexpected', true)).toEqual({ kind: 'failed' });
  });
});

import { maskLinkCodes } from './link-path';

describe('maskLinkCodes', () => {
  it('remplace le code d\'un lien', () => {
    expect(maskLinkCodes('/ranking/join/ABCD2345')).toBe('/ranking/join/{code}');
    expect(maskLinkCodes('/setlist/K7P2QX')).toBe('/setlist/{code}');
    expect(maskLinkCodes('/api/social/invitations/ABCD2345/join')).toBe('/api/social/invitations/{code}/join');
    expect(maskLinkCodes('/api/runs/challenges/K7P2QX/comparison')).toBe('/api/runs/challenges/{code}/comparison');
  });

  it("masque aussi une adresse complète et un chemin en capitales", () => {
    expect(maskLinkCodes('https://api.inseconds.cc/api/social/invitations/ABCD2345/join')).toBe('https://api.inseconds.cc/api/social/invitations/{code}/join');
    expect(maskLinkCodes('/Setlist/K7P2QX')).toBe('/setlist/{code}');
    expect(maskLinkCodes('https://inseconds.cc/setlist/history')).toBe('https://inseconds.cc/setlist/history');
  });

  it('laisse les autres chemins', () => {
    for (const path of ['/setlist', '/setlist/history', '/setlist/history/42', '/setlist/hits', '/daily', '/api/social/groups/3']) {
      expect(maskLinkCodes(path)).toBe(path);
    }
  });
});

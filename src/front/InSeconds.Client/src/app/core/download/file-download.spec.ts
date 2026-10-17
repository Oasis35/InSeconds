import { TestBed } from '@angular/core/testing';
import { FileDownload } from './file-download';

describe('FileDownload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('enregistre le texte sous le nom donné par un lien blob: cliqué puis retiré', async () => {
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });
    const create = vi.spyOn(URL, 'createObjectURL');

    TestBed.inject(FileDownload).saveText('inseconds-donnees-2026-10-17.json', '{"a":1}');

    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe('inseconds-donnees-2026-10-17.json');
    expect(clicked!.href).toMatch(/^blob:/);
    expect(clicked!.isConnected).toBe(false);
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"a":1}');
  });
});

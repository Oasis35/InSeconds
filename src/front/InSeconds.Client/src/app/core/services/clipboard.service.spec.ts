import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  let service: ClipboardService;
  let writeTextSpy: Mock;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ClipboardService] });
    service = TestBed.inject(ClipboardService);
    writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  it('should resolve true when navigator.clipboard.writeText succeeds', async () => {
    writeTextSpy.mockResolvedValue(undefined);

    const result = await service.copy('hello');

    expect(writeTextSpy).toHaveBeenCalledWith('hello');
    expect(result).toBe(true);
  });

  it('should resolve false (never reject) when navigator.clipboard.writeText fails', async () => {
    writeTextSpy.mockRejectedValue(new Error('NotAllowedError'));

    const result = await service.copy('hello');

    expect(result).toBe(false);
  });
});

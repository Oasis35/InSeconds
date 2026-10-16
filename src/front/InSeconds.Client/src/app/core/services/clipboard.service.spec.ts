import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';
import { ErrorReportingService } from './error-reporting.service';

describe('ClipboardService', () => {
  let service: ClipboardService;
  let writeTextSpy: Mock;
  let execCommandSpy: Mock;
  let reportSpy: Mock;

  beforeEach(() => {
    reportSpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [ClipboardService, { provide: ErrorReportingService, useValue: { report: reportSpy } }],
    });
    service = TestBed.inject(ClipboardService);
    writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(false);
  });

  it('should resolve true when navigator.clipboard.writeText succeeds, without fallback', async () => {
    writeTextSpy.mockResolvedValue(undefined);

    const result = await service.copy('hello');

    expect(writeTextSpy).toHaveBeenCalledWith('hello');
    expect(execCommandSpy).not.toHaveBeenCalled();
    expect(reportSpy).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('should fall back to execCommand("copy") on a textarea holding the text when writeText rejects (#200)', async () => {
    writeTextSpy.mockRejectedValue(new DOMException('Document is not focused.', 'NotAllowedError'));
    let copiedValue: string | undefined;
    execCommandSpy.mockImplementation(() => {
      copiedValue = document.querySelector('textarea')?.value;
      return true;
    });

    const result = await service.copy('✅/❌ 1s');

    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(copiedValue).toBe('✅/❌ 1s');
    expect(result).toBe(true);
    expect(document.querySelector('textarea')).toBeNull(); // textarea retiré après la copie
  });

  it('should report the writeText failure without the copied text', async () => {
    writeTextSpy.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    execCommandSpy.mockReturnValue(true);

    await service.copy('secret text');

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const message = reportSpy.mock.calls[0][0].message as string;
    expect(message).toContain('NotAllowedError');
    expect(message).toContain('fallback ok');
    expect(message).not.toContain('secret text');
  });

  it('should resolve false (never reject) when both writeText and the fallback fail', async () => {
    writeTextSpy.mockRejectedValue(new Error('NotAllowedError'));
    execCommandSpy.mockReturnValue(false);

    const result = await service.copy('hello');

    expect(result).toBe(false);
  });

  it('should resolve false when execCommand throws', async () => {
    writeTextSpy.mockRejectedValue(new Error('NotAllowedError'));
    execCommandSpy.mockImplementation(() => { throw new Error('SecurityError'); });

    const result = await service.copy('hello');

    expect(result).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

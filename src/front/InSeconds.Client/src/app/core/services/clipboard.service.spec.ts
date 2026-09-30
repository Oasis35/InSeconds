import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';
import { ErrorReportingService } from './error-reporting.service';

describe('ClipboardService', () => {
  let service: ClipboardService;
  let writeTextSpy: jasmine.Spy;
  let execCommandSpy: jasmine.Spy;
  let reportSpy: jasmine.Spy;

  beforeEach(() => {
    reportSpy = jasmine.createSpy('report');
    TestBed.configureTestingModule({
      providers: [ClipboardService, { provide: ErrorReportingService, useValue: { report: reportSpy } }],
    });
    service = TestBed.inject(ClipboardService);
    writeTextSpy = spyOn(navigator.clipboard, 'writeText');
    execCommandSpy = spyOn(document, 'execCommand');
  });

  it('should resolve true when navigator.clipboard.writeText succeeds, without fallback', async () => {
    writeTextSpy.and.returnValue(Promise.resolve());

    const result = await service.copy('hello');

    expect(writeTextSpy).toHaveBeenCalledWith('hello');
    expect(execCommandSpy).not.toHaveBeenCalled();
    expect(reportSpy).not.toHaveBeenCalled();
    expect(result).toBeTrue();
  });

  it('should fall back to execCommand("copy") on a textarea holding the text when writeText rejects (#200)', async () => {
    writeTextSpy.and.returnValue(Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')));
    let copiedValue: string | undefined;
    execCommandSpy.and.callFake(() => {
      copiedValue = (document.activeElement as HTMLTextAreaElement | null)?.value
        ?? (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value;
      return true;
    });

    const result = await service.copy('✅/❌ 1s');

    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(copiedValue).toBe('✅/❌ 1s');
    expect(result).toBeTrue();
    expect(document.querySelector('textarea')).toBeNull(); // textarea retiré après la copie
  });

  it('should report the writeText failure without the copied text', async () => {
    writeTextSpy.and.returnValue(Promise.reject(new DOMException('denied', 'NotAllowedError')));
    execCommandSpy.and.returnValue(true);

    await service.copy('secret text');

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const message = reportSpy.calls.mostRecent().args[0].message as string;
    expect(message).toContain('NotAllowedError');
    expect(message).toContain('fallback ok');
    expect(message).not.toContain('secret text');
  });

  it('should resolve false (never reject) when both writeText and the fallback fail', async () => {
    writeTextSpy.and.returnValue(Promise.reject(new Error('NotAllowedError')));
    execCommandSpy.and.returnValue(false);

    const result = await service.copy('hello');

    expect(result).toBeFalse();
  });

  it('should resolve false when execCommand throws', async () => {
    writeTextSpy.and.returnValue(Promise.reject(new Error('NotAllowedError')));
    execCommandSpy.and.throwError('SecurityError');

    const result = await service.copy('hello');

    expect(result).toBeFalse();
    expect(document.querySelector('textarea')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  let service: ClipboardService;
  let writeTextSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ClipboardService] });
    service = TestBed.inject(ClipboardService);
    writeTextSpy = spyOn(navigator.clipboard, 'writeText');
  });

  it('should resolve true when navigator.clipboard.writeText succeeds', async () => {
    writeTextSpy.and.returnValue(Promise.resolve());

    const result = await service.copy('hello');

    expect(writeTextSpy).toHaveBeenCalledWith('hello');
    expect(result).toBeTrue();
  });

  it('should resolve false (never reject) when navigator.clipboard.writeText fails', async () => {
    writeTextSpy.and.returnValue(Promise.reject(new Error('NotAllowedError')));

    const result = await service.copy('hello');

    expect(result).toBeFalse();
  });
});

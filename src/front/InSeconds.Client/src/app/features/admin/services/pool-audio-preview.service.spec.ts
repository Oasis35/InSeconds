import { TestBed } from '@angular/core/testing';
import { PoolAudioPreviewService } from './pool-audio-preview.service';

describe('PoolAudioPreviewService', () => {
  let service: PoolAudioPreviewService;
  let playSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PoolAudioPreviewService] });
    service = TestBed.inject(PoolAudioPreviewService);
    playSpy = spyOn(HTMLMediaElement.prototype, 'play').and.returnValue(Promise.resolve());
    spyOn(HTMLMediaElement.prototype, 'pause');
  });

  it('does nothing when the url is missing', () => {
    service.toggle(undefined);
    service.toggle(null);
    expect(playSpy).not.toHaveBeenCalled();
    expect(service.playing()).toBe(false);
  });

  it('plays a new url and sets playing to true once play() resolves', async () => {
    service.toggle('https://example.com/preview.mp3');
    await Promise.resolve(); // laisse le .then() de play() se résoudre
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(service.playing()).toBe(true);
  });

  it('pauses when toggled again while already playing', async () => {
    service.toggle('https://example.com/preview.mp3');
    await Promise.resolve();
    expect(service.playing()).toBe(true);

    service.toggle('https://example.com/preview.mp3');
    expect(service.playing()).toBe(false);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('stops the previous track and starts a new one when the url changes mid-playback', async () => {
    service.toggle('https://example.com/a.mp3');
    await Promise.resolve();
    expect(service.playing()).toBe(true);

    service.toggle('https://example.com/b.mp3');
    await Promise.resolve();
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(service.playing()).toBe(true);
  });

  it('resets playing to false on stop()', async () => {
    service.toggle('https://example.com/preview.mp3');
    await Promise.resolve();
    service.stop();
    expect(service.playing()).toBe(false);
  });

  it('sets playing to false and progress to 100 when the track ends naturally', async () => {
    service.toggle('https://example.com/preview.mp3');
    await Promise.resolve();
    expect(service.playing()).toBe(true);

    (service as unknown as { audio: HTMLAudioElement }).audio.onended?.(new Event('ended'));

    expect(service.playing()).toBe(false);
    expect(service.progress()).toBe(100);
  });
});

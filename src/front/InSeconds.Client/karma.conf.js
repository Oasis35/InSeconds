// Configuration Karma — seul ajout par rapport aux défauts d'@angular/build:karma : le lanceur
// ChromeHeadlessAutoplay. Sans --autoplay-policy=no-user-gesture-required, Chrome headless
// refuse tout audio.play() (NotAllowedError) : les tests d'AudioPlayerService, qui utilisent
// un vrai <audio>, ne vérifieraient aucune lecture réelle (cf. piège 44 CLAUDE.md).
module.exports = function karmaConfig(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
    ],
    customLaunchers: {
      ChromeHeadlessAutoplay: {
        base: 'ChromeHeadless',
        flags: ['--autoplay-policy=no-user-gesture-required'],
      },
    },
    jasmineHtmlReporter: { suppressAll: true },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadlessAutoplay'],
    restartOnFileChange: true,
  });
};

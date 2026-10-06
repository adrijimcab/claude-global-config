/**
 * Karma config for the coverage-caps gate: Jasmine specs in headless Chrome, with the `coverage` preprocessor
 * on every non-spec source and a global threshold check. The run exits non-zero when any cap is missed.
 * The target directory comes from `--target <dir>`; reports go to the system temp directory.
 *
 * @es Config de Karma para el gate de topes de cobertura: specs de Jasmine en Chrome headless, con el
 * preprocesador `coverage` sobre cada fuente que no es spec y una comprobación de umbral global. La corrida
 * sale con código distinto de cero si algún tope no se cumple. El directorio sale de `--target <dir>`.
 */

const os = require('node:os');
const path = require('node:path');

module.exports = function (config) {
  const flag = process.argv.indexOf('--target');
  const target = path.resolve(flag === -1 ? '.' : process.argv[flag + 1]).split(path.sep).join('/');

  config.set({
    basePath: target,
    frameworks: ['jasmine'],
    plugins: ['karma-jasmine', 'karma-chrome-launcher', 'karma-coverage'],
    files: ['*.js'],
    preprocessors: { '!(*.spec).js': ['coverage'] },
    reporters: ['dots', 'coverage'],
    coverageReporter: {
      dir: path.join(os.tmpdir(), 'gates-kit-karma-coverage'),
      reporters: [{ type: 'text-summary' }],
      check: { global: { statements: 85, branches: 80, functions: 85, lines: 85 } },
    },
    browsers: ['ChromeHeadless'],
    singleRun: true,
    autoWatch: false,
  });
};

/**
 * Jest config for the coverage-caps gate: specs run with coverage collected from every source file of the
 * target, and a global threshold that makes the run exit non-zero when any cap is missed. The target directory
 * comes from the `--rootDir` flag of the command; reports go to the system temp directory, so a run leaves
 * nothing in the kit.
 *
 * @es Config de Jest para el gate de topes de cobertura: los specs corren con cobertura recogida de cada
 * fuente del directorio y un umbral global que hace que la corrida salga con código distinto de cero si algún
 * tope no se cumple. El directorio sale del flag `--rootDir` del comando; los informes van al directorio
 * temporal del sistema, así que una corrida no deja nada en el kit.
 */

const os = require('node:os');
const path = require('node:path');

module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['*.js'],
  coverageDirectory: path.join(os.tmpdir(), 'gates-kit-jest-coverage'),
  coverageReporters: ['text-summary'],
  coverageThreshold: { global: { statements: 85, branches: 80, functions: 85, lines: 85 } },
};

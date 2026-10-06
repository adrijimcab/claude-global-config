/**
 * Vitest config for the coverage-caps gate: specs run with the V8 coverage provider over every source file of
 * the target, and global thresholds that make the run exit non-zero when any cap is missed. The target
 * directory comes from the `--root` flag of the command; reports go to the system temp directory, so a run
 * leaves nothing in the kit. Test globals are on so the fixtures need no import of the runner. Vitest 3 looks
 * the provider up from the root it runs in, which holds no `node_modules`, so the provider is named by its
 * path in the toolchain (`GATES_KIT_TOOLCHAIN`, else the current directory); it is still `@vitest/coverage-v8`.
 *
 * @es Config de Vitest para el gate de topes de cobertura: los specs corren con el proveedor de cobertura V8
 * sobre cada fuente del directorio, y umbrales globales que hacen que la corrida salga con código distinto de
 * cero si algún tope no se cumple. El directorio sale del flag `--root` del comando; los informes van al
 * directorio temporal del sistema, así que una corrida no deja nada en el kit. Los globals de test están
 * activos para que los fixtures no importen el runner. Vitest 3 busca el proveedor desde la raíz donde corre,
 * que no tiene `node_modules`, así que el proveedor se nombra por su ruta en la toolchain
 * (`GATES_KIT_TOOLCHAIN`, o el directorio actual); sigue siendo `@vitest/coverage-v8`.
 */

import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const toolchain = createRequire(path.join(process.env.GATES_KIT_TOOLCHAIN ?? process.cwd(), 'noop.js'));

export default {
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: 'custom',
      customProviderModule: toolchain.resolve('@vitest/coverage-v8'),
      include: ['*.js'],
      reportsDirectory: path.join(os.tmpdir(), 'gates-kit-vitest-coverage'),
      reporter: ['text-summary'],
      thresholds: { statements: 85, branches: 80, functions: 85, lines: 85 },
    },
  },
};

/**
 * Flat ESLint config for the check-only lint gate: the typescript-eslint recommended preset plus two
 * auto-fixable rules, with inline directives inert (`noInlineConfig`) and unused ones reported. The gate runs
 * ESLint WITHOUT `--fix`, so a fixable violation fails the run instead of being rewritten and forgotten.
 * Packages resolve from `GATES_KIT_TOOLCHAIN` (the directory holding `node_modules`), else the current directory.
 *
 * @es Config plana de ESLint para el gate de lint de solo comprobación: el preset recommended de
 * typescript-eslint más dos reglas auto-corregibles, con las directivas en línea inertes (`noInlineConfig`).
 * El gate corre ESLint SIN `--fix`, así que una violación corregible falla la corrida en vez de reescribirse
 * y olvidarse. Los paquetes se resuelven desde `GATES_KIT_TOOLCHAIN`, o desde el directorio actual.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

const toolchain = createRequire(path.join(process.env.GATES_KIT_TOOLCHAIN ?? process.cwd(), 'noop.js'));
const tseslint = toolchain('typescript-eslint');

export default tseslint.config({
  files: ['**/*.ts'],
  extends: [...tseslint.configs.recommended],
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  rules: {
    'prefer-const': 'error',
    'no-var': 'error',
  },
});

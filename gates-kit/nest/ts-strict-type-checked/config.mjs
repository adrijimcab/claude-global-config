/**
 * Flat ESLint config: the typescript-eslint `strict-type-checked` preset over every TypeScript file, with
 * type information from the project service. No rule is changed; the preset is the whole contract.
 * Packages resolve from `GATES_KIT_TOOLCHAIN` (the directory holding `node_modules`), else the current directory.
 *
 * @es Config plana de ESLint: el preset `strict-type-checked` de typescript-eslint sobre todo fichero
 * TypeScript, con información de tipos del servicio de proyecto. No se cambia ninguna regla: el preset es el
 * contrato completo. Los paquetes se resuelven desde `GATES_KIT_TOOLCHAIN` (el directorio con `node_modules`).
 */

import { createRequire } from 'node:module';
import path from 'node:path';

const toolchain = createRequire(path.join(process.env.GATES_KIT_TOOLCHAIN ?? process.cwd(), 'noop.js'));
const tseslint = toolchain('typescript-eslint');

export default tseslint.config({
  files: ['**/*.ts'],
  extends: [...tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: process.cwd(),
    },
  },
});

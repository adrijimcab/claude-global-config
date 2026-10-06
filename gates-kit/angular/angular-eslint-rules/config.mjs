/**
 * Flat ESLint config for the per-major angular-eslint gate: the rules `angular-lint-rules.mjs` turns on for the
 * Angular major of the installed toolchain, each an error, over TypeScript (typed, so `no-experimental` and
 * `no-developer-preview` can read the JSDoc tags of what a file uses) and over HTML templates. The major is
 * read from the installed `angular-eslint` package, whose major moves with Angular's; a major the table does
 * not cover throws, so the config fails to load and the gate goes red. Inline directives are inert.
 * Packages resolve from `GATES_KIT_TOOLCHAIN` (the directory holding `node_modules`), else the current directory.
 *
 * @es Config plana de ESLint para el gate de angular-eslint por major: las reglas que `angular-lint-rules.mjs`
 * activa para la major de Angular de la toolchain instalada, cada una como error, sobre TypeScript (con tipos,
 * para que `no-experimental` y `no-developer-preview` lean las etiquetas JSDoc de lo que usa un fichero) y sobre
 * plantillas HTML. La major se lee del paquete `angular-eslint` instalado, cuya major va con la de Angular; una
 * major que la tabla no cubre lanza, la config no carga y el gate sale en rojo. Las directivas en línea son
 * inertes. Los paquetes se resuelven desde `GATES_KIT_TOOLCHAIN`, o desde el directorio actual.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { angularRulesFor, majorOfAngularEslint } from '../../angular-lint-rules.mjs';

const root = process.env.GATES_KIT_TOOLCHAIN ?? process.cwd();
const toolchain = createRequire(path.join(root, 'noop.js'));
const tseslint = toolchain('typescript-eslint');
const angular = toolchain('angular-eslint');
const { version } = JSON.parse(readFileSync(path.join(root, 'node_modules', 'angular-eslint', 'package.json'), 'utf8'));
const rules = angularRulesFor(majorOfAngularEslint(version));
const linterOptions = { noInlineConfig: true, reportUnusedDisableDirectives: 'error' };

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: process.cwd() } },
    plugins: { '@angular-eslint': angular.tsPlugin },
    linterOptions,
    rules: rules.ts,
  },
  {
    files: ['**/*.html'],
    languageOptions: { parser: angular.templateParser },
    plugins: { '@angular-eslint/template': angular.templatePlugin },
    linterOptions,
    rules: rules.template,
  },
];

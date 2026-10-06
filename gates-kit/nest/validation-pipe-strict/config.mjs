/**
 * Flat ESLint config for the ValidationPipe gate: every `new ValidationPipe(...)` must set `whitelist: true`
 * and `forbidNonWhitelisted: true` in its own options object, so a request body can never carry a property
 * the DTO does not declare (the mass-assignment class of `node-express.md` section 1). The rule is an AST
 * selector (`no-restricted-syntax`), never a text search; inline directives are inert (`noInlineConfig`) and
 * unused ones are errors. Packages resolve from `GATES_KIT_TOOLCHAIN` (the directory holding `node_modules`),
 * else the current directory.
 *
 * @es Config plana de ESLint para el gate de ValidationPipe: todo `new ValidationPipe(...)` debe fijar
 * `whitelist: true` y `forbidNonWhitelisted: true` en su propio objeto de opciones, de modo que un cuerpo de
 * petición nunca lleve una propiedad que el DTO no declara (la clase mass-assignment de `node-express.md`,
 * sección 1). La regla es un selector de AST (`no-restricted-syntax`), nunca una búsqueda de texto; las
 * directivas en línea son inertes. Los paquetes se resuelven desde `GATES_KIT_TOOLCHAIN`, o desde el
 * directorio actual.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

const toolchain = createRequire(path.join(process.env.GATES_KIT_TOOLCHAIN ?? process.cwd(), 'noop.js'));
const tseslint = toolchain('typescript-eslint');

/** The selector of a `new ValidationPipe(...)` whose own options lack `option: true`. @es El selector de un `new ValidationPipe(...)` sin `option: true`. */
const lacking = (option) => `NewExpression[callee.name='ValidationPipe']:not(:has(Property[key.name='${option}'][value.value=true]))`;

export default tseslint.config({
  files: ['**/*.ts'],
  languageOptions: { parser: tseslint.parser },
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  rules: {
    'no-restricted-syntax': [
      'error',
      { selector: lacking('whitelist'), message: 'ValidationPipe must set whitelist: true so undeclared properties are stripped. @es ValidationPipe debe fijar whitelist: true para descartar las propiedades no declaradas.' },
      { selector: lacking('forbidNonWhitelisted'), message: 'ValidationPipe must set forbidNonWhitelisted: true so undeclared properties are rejected. @es ValidationPipe debe fijar forbidNonWhitelisted: true para rechazar las propiedades no declaradas.' },
    ],
  },
});

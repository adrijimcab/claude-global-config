#!/usr/bin/env node
/**
 * Proves the scoped-spec helper against a real TypeScript on a fixture project built in a private folder: a spec at
 * the root that reaches a changed service through a component imported by a path alias is listed, so is one that
 * reaches it through a dynamic `import()`, a changed spec lists itself, an unrelated spec and a file under
 * node_modules are left out, a cycle ends, and every malformed input is NOT MEASURED (exit 2), never an empty green.
 *
 * The TypeScript used is the one this folder pins (`package.json`, `npm ci --prefix scoped-proof`), named as a
 * precondition: the helper itself loads the project's own, which a fixture does not install. The global one cannot
 * serve: measured 2026-11-18, it is TypeScript 7.0.2, which exports no JavaScript compiler API.
 *
 * @es Prueba el helper de specs acotados contra un TypeScript real sobre un proyecto de fixture en una carpeta privada:
 * sale un spec de la raíz que llega a un servicio cambiado a través de un componente importado por alias, también uno
 * que llega por un `import()` dinámico, un spec cambiado se lista a sí mismo, quedan fuera un spec ajeno y un fichero
 * de node_modules, un ciclo termina, y toda entrada mal formada es NO MEDIDO (salida 2), nunca un verde vacío. El
 * TypeScript usado es el que fija esta carpeta (`npm ci --prefix scoped-proof`), nombrado como precondición; el global
 * no sirve: es TypeScript 7.0.2, que no exporta la API de compilador en JavaScript.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { optionsOf, specsFor } from './cli.mjs';
import { relatedSpecs } from './related-specs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
let checks = 0;

const check = (label, actual, expected) => {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
};

let typescript;

try {
  typescript = createRequire(path.join(HERE, 'package.json'))('typescript');
} catch (error) {
  throw new Error(`precondition: the pinned typescript is not installed; run npm ci --prefix ${HERE} (${error instanceof Error ? error.message : String(error)}) @es precondición: el typescript fijado no está instalado; corré npm ci --prefix ${HERE}`);
}

const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'related-specs-')));
const write = (relative, text) => {
  const file = path.join(root, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

try {
  write('package.json', '{ "name": "fixture", "private": true }\n');
  write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', module: 'es2022', moduleResolution: 'bundler', paths: { '@core/*': ['src/core/*'] } } }));
  write('src/core/svc.ts', 'export const svc = 1;\n');
  write('src/feature/comp.ts', "import { svc } from '@core/svc';\nexport const comp = svc;\n");
  write('src/feature/comp.spec.ts', "import { comp } from './comp';\nvoid comp;\n");
  write('src/app.spec.ts', "import { comp } from './feature/comp';\nvoid comp;\n");
  write('src/routes.ts', "export const routes = [{ load: () => import('./feature/comp') }];\n");
  write('src/routes.spec.ts', "import { routes } from './routes';\nvoid routes;\n");
  write('src/other.spec.ts', 'export const other = 2;\n');
  write('src/lonely.ts', 'export const lonely = 3;\n');
  write('src/cycle/a.ts', "import { b } from './b';\nexport const a = b;\n");
  write('src/cycle/b.ts', "import { a } from './a';\nexport const b = a;\n");
  write('src/cycle/a.spec.ts', "import { a } from './a';\nvoid a;\n");
  write('node_modules/dep/index.spec.ts', "import { svc } from '../../src/core/svc';\nvoid svc;\n");

  const specs = (changed) => specsFor({ root, tsconfig: 'tsconfig.json', changed, typescript });

  check('alias, transitive and dynamic importers of a changed service are listed; unrelated and node_modules are not', specs(['src/core/svc.ts']), ['src/app.spec.ts', 'src/feature/comp.spec.ts', 'src/routes.spec.ts']);
  check('a changed spec lists itself', specs(['src/other.spec.ts']), ['src/other.spec.ts']);
  check('a change no spec reaches gives an empty list', specs(['src/lonely.ts']), []);
  check('an absolute changed path gives the same list', specs([path.join(root, 'src', 'core', 'svc.ts')]), ['src/app.spec.ts', 'src/feature/comp.spec.ts', 'src/routes.spec.ts']);
  check('an import cycle ends and its spec is listed', specs(['src/cycle/b.ts']), ['src/cycle/a.spec.ts']);

  if (process.platform === 'win32') check('a changed path spelled in another case gives the same list', specs(['SRC/CORE/SVC.TS']), ['src/app.spec.ts', 'src/feature/comp.spec.ts', 'src/routes.spec.ts']);

  let outside;

  try {
    specs(['../elsewhere.ts']);
    outside = 'no error';
  } catch (error) {
    outside = error instanceof Error && error.message.includes('outside') ? 'refused' : 'other error';
  }
  check('a changed file outside the root is refused', outside, 'refused');

  check('options: the documented shape parses', optionsOf(['--root', 'r', '--tsconfig', 't.json', '--', 'a.ts', 'b.ts'])?.changed, ['a.ts', 'b.ts']);
  check('options: no changed file is refused', optionsOf(['--root', 'r', '--tsconfig', 't.json', '--']), undefined);
  check('options: a missing separator is refused', optionsOf(['--root', 'r', '--tsconfig', 't.json', 'a.ts']), undefined);
  check('options: flags out of order are refused', optionsOf(['--tsconfig', 't.json', '--root', 'r', '--', 'a.ts']), undefined);

  const cli = (...args) => spawnSync(process.execPath, [path.join(HERE, 'cli.mjs'), ...args], { encoding: 'utf8', windowsHide: true }).status;

  check('cli: bad arguments exit 2', cli('--root', root), 2);
  check('cli: a project with no typescript installed exits 2, never an empty green', cli('--root', root, '--tsconfig', 'tsconfig.json', '--', 'src/core/svc.ts'), 2);

  const keyOf = (file) => file.toLowerCase();
  const pure = (changed) => relatedSpecs({ imports: new Map([['a.ts', ['b.ts']], ['b.ts', []], ['a.spec.ts', ['a.ts']], ['B.spec.ts', ['b.ts']]]), changed, isSpec: (file) => file.endsWith('.spec.ts'), keyOf });

  check('pure: importers are walked backwards and sorted', pure(['b.ts']), ['B.spec.ts', 'a.spec.ts']);
  check('pure: a file is keyed by keyOf, so another spelling matches', pure(['B.TS']), ['B.spec.ts', 'a.spec.ts']);
  check('pure: a changed file absent from the graph that is a spec lists itself', pure(['new.spec.ts']), ['new.spec.ts']);
  check('pure: an importer of an importer is listed, the importee only is not', pure(['a.ts']), ['a.spec.ts']);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`${String(checks - failures)}/${String(checks)} checks passed @es ${String(checks - failures)}/${String(checks)} comprobaciones correctas`);
process.exitCode = failures === 0 ? 0 : 1;

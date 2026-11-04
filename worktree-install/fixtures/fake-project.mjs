/**
 * A CONSTRUCTED project for the selftest: a main checkout with a fake `vitest` whose behaviour mirrors the
 * MEASURED failure, a fake coverage provider, a lockfile, and linked worktrees made with real git.
 *
 * THE FAKE RUNNER MIRRORS THE MECHANISM, not a symptom. Measured with real Vite 7.3.7 (`vite-serve-probe.mjs`
 * beside this file): from a junctioned worktree, the coverage provider's browser entry resolves to its
 * REALPATH in the main checkout, and Vite's dev server answers 403 because that path is outside the project.
 * The fake runner applies the same rule: it resolves `node_modules/@vitest/coverage-v8` to its realpath and
 * fails with Vite's message when that lies outside the directory it runs in. A project whose `fake-runner.json`
 * says `"servesThroughVite": false` stands for a runner that loads modules by realpath without a dev server
 * (Vitest in node mode, measured passing through the same junction), so the junction is proven for it.
 *
 * The other knobs mirror the ways a probe can fail to measure: `passWithNoTests` (exit 0 without running the
 * probe), `hang` (never returns). The runner also writes a `coverage/` folder, as a real one does.
 *
 * THE FAKE npm CLI implements `ci` the way npm does as far as this proof needs: it builds a REAL
 * `node_modules` in its cwd from the fixture's package templates and writes nothing else.
 *
 * @es Un proyecto CONSTRUIDO para el selftest: un checkout principal con un `vitest` falso que reproduce el
 * MECANISMO medido (el proveedor de cobertura resuelve a su realpath en el principal y Vite contesta 403 por
 * estar fuera del proyecto), un lockfile y worktrees enlazados hechos con git real. Los demás interruptores
 * reproducen las formas en que una sonda no mide: `passWithNoTests` y `hang`. El npm falso implementa `ci`
 * construyendo un `node_modules` REAL desde las plantillas.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RUNNER = `import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cwd = realpathSync(process.cwd());
const config = existsSync('fake-runner.json') ? JSON.parse(readFileSync('fake-runner.json', 'utf8')) : {};
const probe = process.argv.at(-1);

if (config.hang) for (;;) {}

mkdirSync('coverage', { recursive: true });
writeFileSync(path.join('coverage', 'lcov.info'), 'TN:\\n');

if (config.passWithNoTests) process.exit(0);

const provider = realpathSync(path.join('node_modules', '@vitest', 'coverage-v8'));

if (config.servesThroughVite !== false && !provider.startsWith(cwd + path.sep)) {
  console.error('Failed to fetch dynamically imported module ' + provider + ' (403: outside of Vite serving allow list)');
  process.exit(1);
}

process.exit(readFileSync(probe, 'utf8').includes('toBe(2)') ? 0 : 1);
`;

const NPM = `import { cpSync } from 'node:fs';

if (process.argv[2] !== 'ci') process.exit(2);
if (process.env.FAKE_NPM_FAIL === '1') { console.error('npm ERR! fake failure'); process.exit(1); }

cpSync(process.env.FAKE_NPM_TEMPLATES, 'node_modules', { recursive: true });
`;

/** Writes `text` at `file`, creating its folder. @es Escribe `text` en `file`. */
function put(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

/** Runs git in `cwd` with a fixed identity. @es Ejecuta git en `cwd`. */
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });

/**
 * Builds the fixture under `root`: `templates/` (the packages), `main/` (a git repository with them installed
 * as a real tree), and the fake npm CLI. `runner` is written as the project's `fake-runner.json`.
 * @returns `{ main, templates, npmCli, worktree(name) }`, where `worktree` adds a linked worktree.
 * @es Construye el fixture bajo `root`.
 */
export function buildFakeProject(root, runner = {}) {
  const templates = path.join(root, 'templates');
  const main = path.join(root, 'main');
  const npmCli = path.join(root, 'fake-npm-cli.mjs');

  put(path.join(templates, 'vitest', 'package.json'), JSON.stringify({ name: 'vitest', version: '3.2.4', bin: { vitest: 'vitest.mjs' } }));
  put(path.join(templates, 'vitest', 'vitest.mjs'), RUNNER);
  put(path.join(templates, '@vitest', 'coverage-v8', 'package.json'), JSON.stringify({ name: '@vitest/coverage-v8', version: '3.2.4' }));
  put(npmCli, NPM);

  put(path.join(main, 'package.json'), JSON.stringify({ name: 'fixture', private: true, type: 'module', devDependencies: { vitest: '3.2.4', '@vitest/coverage-v8': '3.2.4' } }, null, 2));
  put(path.join(main, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages: { 'node_modules/vitest': { version: '3.2.4' } } }, null, 2));
  put(path.join(main, 'fake-runner.json'), JSON.stringify(runner));
  put(path.join(main, '.gitignore'), 'node_modules\ncoverage\n');
  cpSync(templates, path.join(main, 'node_modules'), { recursive: true });

  git(main, 'init', '-q', '-b', 'main');
  // The fixture owns its line endings: without this, a host whose system config turns core.autocrlf on (Git for
  // Windows does, and the selftest runner's empty HOME drops the user's override) checks the worktree out with CRLF,
  // and its lockfile hash differs from the LF file written here.
  // @es El fixture fija sus finales de línea: sin esto, un host cuyo config de sistema activa core.autocrlf (Git for
  // Windows lo hace, y el HOME vacío del runner quita la anulación del usuario) saca el worktree con CRLF y el hash de su
  // lockfile difiere del fichero LF escrito aquí.
  git(main, 'config', 'core.autocrlf', 'false');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'fixture');

  return {
    main,
    templates,
    npmCli,
    worktree(name) {
      const at = path.join(root, name);

      git(main, 'worktree', 'add', '-q', at);

      return at;
    },
    commit(message) {
      git(main, 'add', '-A');
      git(main, 'commit', '-q', '-m', message);
    }
  };
}

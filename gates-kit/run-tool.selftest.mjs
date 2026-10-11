#!/usr/bin/env node
/**
 * Proof that `run-tool.mjs` DISCRIMINATES. Every case builds a fake toolchain in a temporary folder that is
 * removed at the end. State space: the variable unset or empty (refused by name); an incomplete call; a
 * package that is not installed (refused naming it and the toolchain); a present package whose exit code, output,
 * arguments and environment pass through; the `bin` as an object and as a string; a missing binary name or no
 * `bin` at all; a relative toolchain path; and every refusal carrying its `@es` half.
 * Residual, stated: a child with no exit status (killed by a signal) cannot be built portably on Windows, so
 * the `?? 3` fallback has no case.
 *
 * @es Prueba de que `run-tool.mjs` DISCRIMINA. Cada caso construye una cadena de herramientas falsa en una
 * carpeta temporal que se borra al final. Espacio de estados: la variable sin definir o vacía (rechazada por
 * su nombre); una llamada incompleta; un paquete no instalado (rechazado nombrándolo a él y al directorio);
 * un paquete presente cuyo código de salida, salida, argumentos y entorno pasan intactos; el `bin` como objeto
 * y como cadena; un nombre de binario ausente o ningún `bin`; una ruta relativa; y que cada rechazo lleve su
 * mitad `@es`. Residual: un hijo sin código de salida (muerto por señal) no se puede construir de forma
 * portable en Windows, así que el `?? 3` no tiene caso.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

const RUN_TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-tool.mjs');
const TABLE = {
  passed: { en: 'run-tool selftest: {count} assertion(s) passed.', es: 'selftest de run-tool: {count} aserción(es) correcta(s).' },
  failed: { en: 'FAILED: {label}', es: 'FALLÓ: {label}' },
  failures: { en: 'run-tool selftest: {count} assertion(s) failed.', es: 'selftest de run-tool: {count} aserción(es) fallida(s).' },
};
const speaker = makeSpeaker(TABLE);
const TOOL = "process.stdout.write(`args=${process.argv.slice(3).join('|')} marker=${process.env.MARKER ?? ''} cwd=${process.cwd()}`);process.exit(Number(process.argv[2]));\n";

let passed = 0;
const failures = [];
const root = mkdtempSync(path.join(tmpdir(), 'run-tool-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(root, { recursive: true, force: true }));

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** Installs a fake package under `<root>/node_modules`. @es Instala un paquete falso. */
function install(name, manifest, files = { 'bin.js': TOOL }) {
  const dir = path.join(root, 'node_modules', name);

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
  for (const [file, content] of Object.entries(files)) writeFileSync(path.join(dir, file), content);
}

install('object-tool', { bin: { alpha: 'bin.js' } });
install('string-tool', { bin: 'bin.js' });
install('no-bin-tool', {});

/** Runs the launcher with an environment (`toolchain` undefined removes the variable). @es Corre el lanzador. */
function launch(toolchain, args, extra = {}) {
  const env = { ...process.env, ...extra };

  delete env.GATES_KIT_TOOLCHAIN;
  if (toolchain !== undefined) env.GATES_KIT_TOOLCHAIN = toolchain;

  return spawnSync(process.execPath, [RUN_TOOL, ...args], { env, encoding: 'utf8', cwd: extra.CWD ?? root });
}

// The variable: unset and empty are refused by name, before anything else is looked up.
const unset = launch(undefined, ['object-tool', 'alpha', '0']);
const empty = launch('', ['object-tool', 'alpha', '0']);

check('an unset variable exits 3', unset.status === 3);
check('an unset variable is refused by its name', unset.stderr.includes('GATES_KIT_TOOLCHAIN'));
check('an empty variable exits 3', empty.status === 3);
check('an empty variable is refused by its name', empty.stderr.includes('GATES_KIT_TOOLCHAIN'));
check('an unset variable runs nothing', unset.stdout === '');

// An incomplete call.
check('no arguments exits 3', launch(root, []).status === 3);
check('only a package exits 3', launch(root, ['object-tool']).status === 3);
check('an incomplete call prints the usage', launch(root, []).stderr.includes('usage'));
check('a call with only a package prints the usage', launch(root, ['object-tool']).stderr.includes('usage'));

// A package that is not installed.
const missing = launch(root, ['absent-tool', 'alpha', '0']);

check('a missing package exits 3', missing.status === 3);
check('a missing package is named', missing.stderr.includes('absent-tool'));
check('a missing package names the toolchain', missing.stderr.includes(root));

// A present package: the status, the output, the arguments and the environment pass through.
for (const code of [0, 1, 7]) check(`the tool exit code ${code} passes through`, launch(root, ['object-tool', 'alpha', String(code)]).status === code);

const forwarded = launch(root, ['object-tool', 'alpha', '0', '--flag', 'value', 'last'], { MARKER: 'seen' });

check('the tool output reaches the standard output', forwarded.stdout.includes('args=--flag|value|last'));
check('the arguments after the binary name arrive in order', forwarded.stdout.startsWith('args=--flag|value|last'));
check('the environment reaches the tool', forwarded.stdout.includes('marker=seen'));
check('a tool run prints nothing on the error stream', forwarded.stderr === '');

// The `bin` shapes.
check('a string bin runs whatever the binary name', launch(root, ['string-tool', 'whatever', '5']).status === 5);
check('an object bin runs the named binary', launch(root, ['object-tool', 'alpha', '4']).status === 4);

const wrongBin = launch(root, ['object-tool', 'beta', '0']);

check('an object bin without the named binary exits 3', wrongBin.status === 3);
check('a missing binary names the package and the binary', wrongBin.stderr.includes('object-tool') && wrongBin.stderr.includes('beta'));
check('a package with no bin exits 3', launch(root, ['no-bin-tool', 'alpha', '0']).status === 3);

// A relative toolchain path resolves from the current folder.
check('a relative toolchain path is resolved', launch('.', ['object-tool', 'alpha', '6']).status === 6);
check('a toolchain folder without the package exits 3 even when the package exists elsewhere', launch(path.join(root, 'node_modules', 'object-tool'), ['no-such-package', 'alpha', '0']).status === 3);

// The working directory: by default the caller's, or the one `--cwd` names before the package.
mkdirSync(path.join(root, 'work', 'inner'), { recursive: true });

const workDir = path.join(root, 'work');
const here = launch(root, ['object-tool', 'alpha', '0']);
const moved = launch(root, ['--cwd', workDir, 'object-tool', 'alpha', '0', 'after']);
const relative = launch(root, ['--cwd', 'work/inner', 'object-tool', 'alpha', '0']);
const noDirectory = launch(root, ['--cwd']);
const absentDirectory = launch(root, ['--cwd', path.join(root, 'no-such-folder'), 'object-tool', 'alpha', '0']);

check('without --cwd the tool runs where the caller is', here.stdout.endsWith(`cwd=${root}`));
check('--cwd moves the tool to that folder', moved.stdout.endsWith(`cwd=${workDir}`));
check('--cwd keeps the arguments after the binary name', moved.stdout.startsWith('args=after '));
check('--cwd keeps the exit code of the tool', launch(root, ['--cwd', workDir, 'object-tool', 'alpha', '4']).status === 4);
check('a relative --cwd resolves from the caller folder', relative.stdout.endsWith(`cwd=${path.join(root, 'work', 'inner')}`));
check('--cwd without a folder exits 3', noDirectory.status === 3);
check('--cwd without a folder prints the usage', noDirectory.stderr.includes('usage'));
check('--cwd with only a folder exits 3', launch(root, ['--cwd', workDir]).status === 3);
check('a folder that does not exist exits 3, not the tool code', absentDirectory.status === 3 && absentDirectory.stdout === '');
check('a folder that does not exist is named', absentDirectory.stderr.includes('no-such-folder'));

const relativeAbsent = launch(root, ['--cwd', 'no-such-relative', 'object-tool', 'alpha', '0']);
const fileAsDirectory = launch(root, ['--cwd', path.join(root, 'node_modules', 'object-tool', 'bin.js'), 'object-tool', 'alpha', '0']);

check('a relative folder that does not exist is named by its resolved path', relativeAbsent.status === 3 && relativeAbsent.stderr.includes(path.join(root, 'no-such-relative')));
check('a file given as the folder exits 3 and is named', fileAsDirectory.status === 3 && fileAsDirectory.stderr.includes('bin.js'));
check('--cwd is only read before the package', launch(root, ['object-tool', 'alpha', '0', '--cwd', workDir]).stdout.startsWith(`args=--cwd|${workDir} `));
check('--cwd still refuses a missing package', launch(root, ['--cwd', workDir, 'absent-tool', 'alpha', '0']).status === 3);

// Every refusal is bilingual, with its accents.
const refusals = [unset, empty, launch(root, []), missing, wrongBin, noDirectory, absentDirectory];

check('every refusal carries its @es half', refusals.every((refusal) => refusal.stderr.includes(' @es ')));
check('the Spanish half keeps its accents', unset.stderr.includes('está'));

for (const label of failures) speaker.complain('failed', { label });

if (failures.length > 0) {
  speaker.complain('failures', { count: failures.length });
  process.exit(1);
}

speaker.say('passed', { count: passed });

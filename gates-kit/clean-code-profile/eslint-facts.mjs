/**
 * Asks ESLint itself what it enforces, instead of reading its config as text: `eslint --print-config <file>` on a
 * sample source file returns the rules, severities and options that apply to that file after every preset and
 * override. The sample is chosen by a fixed, stated order (so the evidence names the file), one TypeScript or
 * JavaScript file and, for Angular, one component template. The ESLint run is a function the caller passes in
 * (`runPrintConfig`), so a proof can answer without a real ESLint; `runInstalledEslint` is the real one.
 *
 * @es Pregunta a ESLint mismo qué aplica, en vez de leer su config como texto: `eslint --print-config <fichero>`
 * sobre un fichero fuente de muestra devuelve las reglas, severidades y opciones que aplican a ese fichero tras
 * todo preset y override. La muestra se elige por un orden fijo y dicho (la evidencia nombra el fichero): un
 * fichero TypeScript o JavaScript y, en Angular, una plantilla de componente. La ejecución de ESLint es una función
 * que pasa quien llama (`runPrintConfig`), así que una prueba puede responder sin un ESLint real;
 * `runInstalledEslint` es la real.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git', '.angular', 'temp', 'out-tsc', '.claude', '.claude-wt', 'e2e', 'scripts', 'docs', 'schematics', '.storybook']);
const NON_SAMPLE = /\.(spec|test|stories|d|config|mutants|selftest)\.(ts|mts|js|mjs|cjs)$/;
const SCRIPT_SAMPLE = { angular: /\.ts$/, node: /\.(mjs|js|cjs)$/ };
const PRINT_CONFIG_TIMEOUT_MS = 120_000;

/** Every file under `root`, sorted, skipping tool and output folders. @es Todo fichero bajo `root`, ordenado, sin carpetas de herramienta ni salida. */
function walk(root, directory = root, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) walk(root, full, found);
    else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join('/'));
  }

  return found;
}

/**
 * The sample source file for a stack, by a fixed order: under `src/`, a component or service first, then any
 * source file; never a spec, story, declaration, config or selftest.
 * @es El fichero fuente de muestra de un stack, por orden fijo: bajo `src/`, primero componente o servicio, luego cualquiera.
 */
export function scriptSample(files, stack) {
  const candidates = files.filter((file) => SCRIPT_SAMPLE[stack].test(file) && !NON_SAMPLE.test(file));
  const underSource = [...candidates.filter((file) => file.startsWith('src/')), ...candidates.filter((file) => !file.startsWith('src/') && file.includes('/src/'))];
  const preferred = underSource.find((file) => /\.(component|service)\.ts$/.test(file));

  return preferred ?? underSource[0] ?? candidates[0];
}

/** The sample component template, or undefined. @es La plantilla de componente de muestra, o undefined. */
export function templateSample(files) {
  const templates = files.filter((file) => /\.component\.html$/.test(file));

  return templates.find((file) => file.startsWith('src/')) ?? templates.find((file) => file.includes('/src/'));
}

/** The real runner: `eslint --print-config` through the project's own installed ESLint. @es El ejecutor real. */
export function runInstalledEslint(root, file) {
  const bin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');

  if (!existsSync(bin)) return { error: 'eslint is not installed under node_modules @es eslint no está instalado en node_modules' };

  const result = spawnSync(process.execPath, [bin, '--print-config', file], { cwd: root, encoding: 'utf8', timeout: PRINT_CONFIG_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });

  if (result.error !== undefined || result.status !== 0) return { error: `eslint --print-config exited ${result.status ?? 'without a status'}: ${(result.error?.message ?? result.stderr).trim().slice(0, 200)}` };

  try {
    return { rules: JSON.parse(result.stdout).rules ?? {} };
  } catch (error) {
    return { error: `eslint --print-config printed no JSON: ${error.message}` };
  }
}

/**
 * What ESLint enforces on the project's sample files: `{ samples: { script, template } }`, each `{ file, rules }` or
 * `{ file, error }` or undefined when the project has no such file.
 * @es Lo que ESLint aplica a los ficheros de muestra: `{ samples: { script, template } }`.
 */
export function measureEslint(root, stack, runPrintConfig = runInstalledEslint) {
  const files = walk(root);
  const script = scriptSample(files, stack);
  const template = stack === 'angular' ? templateSample(files) : undefined;
  const sample = (file) => (file === undefined ? undefined : { file, ...runPrintConfig(root, file) });

  return { samples: { script: sample(script), template: sample(template) } };
}

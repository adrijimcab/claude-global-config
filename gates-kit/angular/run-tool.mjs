#!/usr/bin/env node
/**
 * Runs one binary of an installed npm package, found in the toolchain directory named by the
 * `GATES_KIT_TOOLCHAIN` environment variable (the directory that holds `node_modules`; it defaults to the
 * current directory). Usage: `node run-tool.mjs <package> <bin> [args...]`.
 * Exit: the tool's own status; 3 when the package or its binary cannot be found (never a silent pass).
 *
 * @es Ejecuta un binario de un paquete npm instalado, buscado en el directorio de herramientas que indica la
 * variable `GATES_KIT_TOOLCHAIN` (el directorio que contiene `node_modules`; por defecto el directorio
 * actual). Salida: la del propio programa; 3 si no se encuentra el paquete o su binario.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [packageName, binName, ...args] = process.argv.slice(2);
const toolchain = path.resolve(process.env.GATES_KIT_TOOLCHAIN ?? process.cwd());

function fail(english, spanish) {
  console.error(`${english} @es ${spanish}`);
  process.exit(3);
}

if (packageName === undefined || binName === undefined) fail('usage: run-tool.mjs <package> <bin> [args]', 'uso: run-tool.mjs <paquete> <bin> [argumentos]');

let manifestPath;

try {
  manifestPath = createRequire(path.join(toolchain, 'noop.js')).resolve(`${packageName}/package.json`);
} catch {
  fail(`package ${packageName} is not installed under ${toolchain}`, `el paquete ${packageName} no está instalado en ${toolchain}`);
}

const bin = JSON.parse(readFileSync(manifestPath, 'utf8')).bin;
const relative = typeof bin === 'string' ? bin : bin?.[binName];

if (relative === undefined) fail(`package ${packageName} has no binary ${binName}`, `el paquete ${packageName} no tiene el binario ${binName}`);

const run = spawnSync(process.execPath, [path.join(path.dirname(manifestPath), relative), ...args], { stdio: 'inherit', env: process.env });

process.exit(typeof run.status === 'number' ? run.status : 3);

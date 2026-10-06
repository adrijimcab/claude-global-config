#!/usr/bin/env node
/**
 * Runs one binary of an installed npm package, found in the toolchain directory named by the
 * `GATES_KIT_TOOLCHAIN` environment variable (the directory that holds `node_modules`). Usage:
 * `node run-tool.mjs [--cwd <dir>] <package> <bin> [args...]`. `--cwd`, read only before the package, runs the
 * tool from `<dir>` instead of the caller's folder, for a tool that finds the project it grades from where it runs.
 * Exit: the tool's own status; 3 when the variable is unset, the package or its binary cannot be found, the
 * `--cwd` folder does not exist, or the call is incomplete (never a silent pass, because a non-zero exit on a
 * fail fixture would read as a catch).
 *
 * @es Ejecuta un binario de un paquete npm instalado, buscado en el directorio de herramientas que indica la
 * variable de entorno `GATES_KIT_TOOLCHAIN` (el directorio que contiene `node_modules`). `--cwd`, solo antes del
 * paquete, corre la herramienta desde `<dir>` en vez de la carpeta de quien llama. Salida: la del propio
 * programa; 3 si la variable no está definida, no se encuentra el paquete o su binario, la carpeta de `--cwd` no
 * existe, o la llamada está incompleta (nunca un pase silencioso).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

const MESSAGES = {
  usage: { en: 'usage: run-tool.mjs [--cwd <dir>] <package> <bin> [args]', es: 'uso: run-tool.mjs [--cwd <dir>] <paquete> <bin> [argumentos]' },
  missingCwd: { en: 'the working directory {cwd} does not exist', es: 'el directorio de trabajo {cwd} no existe' },
  unset: { en: 'the environment variable GATES_KIT_TOOLCHAIN is not set; point it at the directory holding node_modules', es: 'la variable de entorno GATES_KIT_TOOLCHAIN no está definida; debe apuntar al directorio que contiene node_modules' },
  missingPackage: { en: 'package {package} is not installed under {toolchain}', es: 'el paquete {package} no está instalado en {toolchain}' },
  missingBin: { en: 'package {package} has no binary {bin}', es: 'el paquete {package} no tiene el binario {bin}' },
};

const EXIT_NOT_RUN = 3;
const speaker = makeSpeaker(MESSAGES);

function refuse(id, params) {
  speaker.complain(id, params);
  process.exit(EXIT_NOT_RUN);
}

/** Whether `directory` exists and is a folder. @es Si `directory` existe y es una carpeta. */
function isDirectory(directory) {
  try {
    return statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

const argv = process.argv.slice(2);
const withCwd = argv[0] === '--cwd';
const [packageName, binName, ...args] = withCwd ? argv.slice(2) : argv;
const cwd = withCwd && argv[1] !== undefined ? path.resolve(argv[1]) : undefined;

if (packageName === undefined || binName === undefined) refuse('usage');
if (process.env.GATES_KIT_TOOLCHAIN === undefined || process.env.GATES_KIT_TOOLCHAIN === '') refuse('unset');
if (cwd !== undefined && !isDirectory(cwd)) refuse('missingCwd', { cwd });

const toolchain = path.resolve(process.env.GATES_KIT_TOOLCHAIN);
const manifestPath = path.join(toolchain, 'node_modules', packageName, 'package.json');
let manifest;

try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  refuse('missingPackage', { package: packageName, toolchain });
}

const bin = manifest.bin;
const relative = typeof bin === 'string' ? bin : bin?.[binName];

if (relative === undefined) refuse('missingBin', { package: packageName, bin: binName });

const run = spawnSync(process.execPath, [path.join(path.dirname(manifestPath), relative), ...args], { stdio: 'inherit', env: process.env, cwd });

process.exit(run.status ?? EXIT_NOT_RUN);

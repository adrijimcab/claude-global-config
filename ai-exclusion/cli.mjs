#!/usr/bin/env node
/**
 * Entry point: `node ai-exclusion/cli.mjs [--check | --dry-run] <repo>`. Applies, previews or checks the
 * AI-exclusion block of the clone containing `<repo>`. Exit 0: done or already ok; 1: `--check` found the
 * block missing or stale; 2: a tracked-file conflict, a malformed block, a bad call or a git failure.
 *
 * @es Punto de entrada. Aplica, previsualiza o comprueba el bloque de exclusión de IA del clon que contiene
 * `<repo>`. Salida 0: hecho o ya vigente; 1: `--check` halló el bloque ausente o desactualizado; 2: conflicto
 * con un fichero versionado, bloque malformado, llamada incorrecta o fallo de git.
 */

import { pathToFileURL } from 'node:url';

import { AI_PATHS } from './ai-paths.mjs';
import { BEGIN_MARKER, END_MARKER } from './block.mjs';
import { provision } from './provision.mjs';

const MODES = { '--check': 'check', '--dry-run': 'dry-run' };

/** Runs the CLI and returns its exit code. @es Ejecuta la CLI y devuelve su código de salida. */
export function run(argv, out = console) {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const repos = argv.filter((arg) => !arg.startsWith('--'));
  const mode = flags.length === 0 ? 'apply' : MODES[flags[0]];

  if (flags.length > 1 || mode === undefined || repos.length !== 1) {
    out.error('usage: node ai-exclusion/cli.mjs [--check | --dry-run] <repo>. @es uso: node ai-exclusion/cli.mjs [--check | --dry-run] <repo>.');

    return 2;
  }

  let result;

  try {
    result = provision(repos[0], mode);
  } catch (error) {
    out.error(`ai-exclusion failed: ${error instanceof Error ? error.message : String(error)}. @es ai-exclusion falló.`);

    return 2;
  }

  out.log(`${result.status}: ${result.file}`);

  if (result.status === 'conflict') {
    out.error(`The clone TRACKS files the list would match; nothing written: ${result.conflicts.join(', ')}. @es El clon VERSIONA ficheros que la lista coincidiría; no se escribió nada.`);

    return 2;
  }

  if (result.status === 'would-write' || result.status === 'written') {
    out.log([BEGIN_MARKER, ...AI_PATHS.map((entry) => entry.pattern), END_MARKER].join('\n'));
    if (result.alreadyByHand.length > 0) out.log(`also listed by hand outside the block: ${result.alreadyByHand.join(', ')}. @es también listadas a mano fuera del bloque.`);
  }

  return result.status === 'stale' || result.status === 'missing' ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));

#!/usr/bin/env node
/**
 * Campaña de mutantes de `markers.mjs` contra `markers.selftest.mjs`. Hay dos tipos de mutante:
 *   - devolver a la lista un marcador podado (el selftest tiene que ver volver el descarte);
 *   - quitar un marcador conservado que fue el único detector de una lección real.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const F = 'failure-capture/markers.mjs';
const MUTANTS = [
  ['vuelve «no lo verifiqué»', F, "  'lo dije mal',\n", "  'lo dije mal',\n  'no lo verifiqué',\n"],
  ['vuelve «sin verificar»', F, "  'lo dije mal',\n", "  'lo dije mal',\n  'sin verificar',\n"],
  ['vuelve «never ran»', F, "  'no midio',\n", "  'no midio',\n  'never ran',\n"],
  ['vuelve «stale»', F, "  'falso verde',\n", "  'falso verde',\n  'stale',\n"],
  ['se quita «rancio», único detector de una captura', F, "  'rancio',\n", ''],
  ['se quita «nunca corrió», único detector de una captura', F, "  'nunca corrió',\n", ''],
  ['se quita «no midió», que ahora cubre la captura de «stale»', F, "  'no midió',\n", ''],
  ['se quita «me equivoqué»', F, "  'me equivoqué',\n", ''],
  ['el mensaje deja de pasarse a minúsculas', F, 'const haystack = message.toLowerCase();', 'const haystack = message;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'failure-capture/markers.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);

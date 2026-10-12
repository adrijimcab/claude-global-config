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
  ['vuelve «corrección» sola, el sustantivo de «corrección y seguridad»', F, "  'lo dije mal',\n", "  'lo dije mal',\n  'corrección',\n"],
  ['vuelve «correccion» sola, sin tilde', F, "  'lo dije mal',\n", "  'lo dije mal',\n  'correccion',\n"],
  ['vuelve «corrección:» suelta, la de «pendiente de corrección:»', F, "  'lo dije mal',\n", "  'lo dije mal',\n  'corrección:',\n"],
  ['se quita «la corrección:»', F, "  'la corrección:',\n", ''],
  ['se quita «corrección mía»', F, "  'corrección mía',\n", ''],
  ['se quita «correcciones de mi parte»', F, "  'correcciones de mi parte',\n", ''],
  ['se quita «te debo una corrección»', F, "  'te debo una corrección',\n", ''],
  ['se quita «corrección a »', F, "  'corrección a ',\n", ''],
  ['se quita «correccion a », sin tilde', F, "  'correccion a ',\n", ''],
  ['se quita «correcciones a »', F, "  'correcciones a ',\n", ''],
  ['se quita «corrección al »', F, "  'corrección al ',\n", ''],
  ['se quita «correcciones al »', F, "  'correcciones al ',\n", ''],
  ['se quita «te dije mal»', F, "  'te dije mal',\n", ''],
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

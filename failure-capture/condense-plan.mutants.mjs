#!/usr/bin/env node
/**
 * The decisions of the condense plan, each broken once, that `condense-plan.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here lets `condense` shorten
 * a line it had no key for, under a marker it invented, or over a line it was never pointed at.
 *
 * @es Las decisiones del plan de condensación, rotas una a una, que `condense-plan.selftest.mjs` debe
 * atrapar. Un punto ciego aquí deja que `condense` acorte una línea sin clave, bajo un marcador inventado, o
 * una línea a la que nadie apuntó.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PLAN = 'failure-capture/condense-plan.mjs';

const MUTANTS = [
  // --- which lines are this command's business
  ['a line that is not an entry is planned, so headers are reported', PLAN, "if (!line.startsWith('- [')) return undefined;", 'if (false) return undefined;'],
  ['a line already shortened is planned again, so a second run rewrites it', PLAN, 'if (isTiered(line) || (entry.scope', 'if ((entry.scope'],
  ['a line of another scope is planned', PLAN, "(entry.scope !== 'global' && entry.scope !== 'promoted')", 'false'],
  ['an entry that cannot be read is skipped in silence', PLAN, 'if (!entry.ok) return leave(entry);', 'if (!entry.ok) return undefined;'],
  ['the reason of a line that stays loses its Spanish half', PLAN, 'reason: refusal.problem })', "reason: refusal.problem.split(' @es ')[0] })"],

  // --- what a line becomes
  ['a marker-less line gets a key nobody supplied', PLAN, 'entry.marker === undefined ? operatorKey :', "entry.marker === undefined ? (operatorKey ?? 'inferred-key') :"],
  ['a marker-less line gets a marker invented for it', PLAN, 'key, marker: entry.marker })', 'key, marker: entry.marker ?? `<!--fc:${key}#1-->` })'],
  ['a line that needs a key is not flagged', PLAN, ', needsKey: true }', ' }'],
  ['a promoted stub forgets its mechanism path', PLAN, 'mechanism: mechanismOf(entry.body), marker', 'mechanism: undefined, marker'],

  // --- the key map
  ['a prefix matching two lines is accepted', PLAN, 'matches === 1 ? undefined : refuse(', 'true ? undefined : refuse('],
  ['a prefix matching no line is accepted', PLAN, 'matches > 0 ? undefined : refuse(', 'true ? undefined : refuse('],
  ['a prefix under 30 characters is accepted', PLAN, 'entry.line.length >= MIN_PREFIX_LENGTH ? undefined', 'true ? undefined'],
  ['a key that is not kebab-case is accepted by the map', PLAN, 'isValidKey(entry?.key) ? undefined : refuse(', 'true ? undefined : refuse('],
  ['a key already carried by a marker is accepted', PLAN, 'takenKeys.has(entry?.key) ? refuse(', 'false ? refuse('],
  ['a key used by two entries is accepted', PLAN, 'copies === 1 ? undefined', 'true ? undefined'],
  ['an entry already applied by an earlier run is reported as a problem', PLAN, 'if (applied.has(entry?.key)) return;', 'if (false) return;'],
  ['a prefix matches anywhere in the line, not only at its start', PLAN, 'line.startsWith(entry.line)', 'line.includes(entry.line)'],
  ['a line that already has a marker can be named by a prefix', PLAN, "line.startsWith('- [global] ') && readMarker(line) === undefined", "line.startsWith('- [global] ')"],
  ['a line already shortened can be named by a prefix', PLAN, 'readMarker(line) === undefined && !isTiered(line))', 'readMarker(line) === undefined)'],
  ['the Spanish half of the ambiguity refusal is lost', PLAN, '`el prefijo coincide con ${String(matches)} líneas sin marcador (AMBIGUOUS).`', "'(AMBIGUOUS).'"],
  ['the Spanish half of the absence refusal is lost', PLAN, "'el prefijo no coincide con ninguna línea sin marcador (ABSENT).'", "'(ABSENT).'"],
  ['the Spanish half of the prefix refusal is lost', PLAN, '`el prefijo debe ser un texto de al menos ${String(MIN_PREFIX_LENGTH)} caracteres.`', "'prefijo corto.'"],
  ['the Spanish half of the key refusal is lost', PLAN, "'la clave debe ser kebab-case en minúsculas, 4-60 caracteres.'", "'clave.'"],
  ['the Spanish half of the duplicate refusal is lost', PLAN, "'la clave aparece en más de una entrada del mapa de claves.'", "'duplicada.'"],
  ['the Spanish half of the taken-key refusal is lost', PLAN, "'la clave ya la lleva un marcador.'", "'ocupada.'"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/condense-plan.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);

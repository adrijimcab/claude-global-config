#!/usr/bin/env node
/**
 * The decisions of the tiering check's command and inputs, each broken once, that `check.selftest.mjs` must
 * catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here judges the
 * wrong "before", the wrong anchors or the wrong evidence, or turns an unmeasured input into a verdict.
 *
 * Not a row, stated: `entry.anchors ?? []` → `entry.anchors` is EQUIVALENT (an `undefined` anchor never
 * starts a line), so it could not be killed and proves nothing.
 *
 * @es Las decisiones del comando y de las entradas de la comprobación de escalonado, rotas una a una. Un punto
 * ciego aquí juzga el "antes", las anclas o la evidencia equivocados, o convierte una entrada no medida en un
 * veredicto. No es fila: `entry.anchors ?? []` → `entry.anchors` es EQUIVALENTE.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const INPUTS = 'rule-tiering/tiering-inputs.mjs';
const CHECK = 'rule-tiering/check.mjs';

const MUTANTS = [
  // --- the "before"
  ['the named revision is ignored: HEAD is always read', INPUTS, "'show', `${rev}:${file}`", "'show', `HEAD:${file}`"],
  ['a git failure is read as an empty "before"', INPUTS, 'if (result.error !== undefined || result.status !== 0) {', 'if (result.error !== undefined) {'],

  // --- the anchors
  ['anchors of every file apply', INPUTS, ".filter((entry) => entry.file === `${HOME_PREFIX}${file}`)", ''],
  ['the home prefix is dropped, so no entry matches', INPUTS, "const HOME_PREFIX = '.claude/';", "const HOME_PREFIX = '';"],
  ['a missing customizations module is refused instead of meaning no anchors', INPUTS, 'if (!existsSync(module)) return [];', 'if (false) return [];'],
  ['a customizations module that cannot be imported means no anchors', INPUTS, "throw refuse(`cannot import ${module}", "return []; throw refuse(`cannot import ${module}"],

  // --- the evidence
  ['every file in the evidence directory is evidence', INPUTS, '.filter((name) => name.endsWith(EVIDENCE_EXTENSION))', ''],
  ['an evidence directory without evidence is judged', INPUTS, 'if (names.length === 0) throw refuse(', 'if (false) throw refuse('],
  ['an unlistable evidence directory crashes instead of refusing', INPUTS, "throw refuse(`cannot list the evidence directory", "throw error; throw refuse(`cannot list the evidence directory"],

  ['an evidence file outside the repository is given a path inside it', INPUTS, "inside === '' || inside.startsWith('..') || path.isAbsolute(inside) ? undefined", 'false ? undefined'],
  ['the command gives the evidence no repository to be relative to', CHECK, 'evidence: evidenceIn(evidence, repo),', 'evidence: evidenceIn(evidence, evidence),'],

  // --- the "after"
  ['an unreadable after crashes instead of refusing', INPUTS, "throw refuse(`cannot read ${file}", "throw error; throw refuse(`cannot read ${file}"],

  // --- the command
  ['a missing argument is not refused', CHECK, 'if (missing.length > 0) throw new NotMeasured(', 'if (false) throw new NotMeasured('],
  ['a deficit exits 0', CHECK, '  return 1;\n}', '  return 0;\n}'],
  ['a conserved file exits 1', CHECK, '    return 0;\n  }', '    return 1;\n  }'],
  ['not measured exits 1', CHECK, 'process.exitCode = 2;', 'process.exitCode = 1;'],
  ['deficits are not listed', CHECK, "for (const found of deficits) console.log(`  [${found.kind}] ${found.message}`);", ''],
  ['the conserved report is English only', CHECK, 'is conserved. @es ${subject} se conserva.', 'is conserved.']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['rule-tiering', 'failure-capture', 'mutation-proof'],
  selftest: 'rule-tiering/check.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Checks, read-only, whether a proposed "after" of a loaded rule file conserves its "before" at a git revision,
 * and prints a bilingual report naming each deficit. Exit 0 conserved, 1 a deficit, 2 not measured (a missing
 * argument, an unreadable file, a git failure).
 *
 * Usage: node check.mjs --repo <dir> --rev <rev> --file <path in the repository> --after <file> --evidence <dir>
 *
 * @es Comprueba, solo lectura, si un "después" propuesto de un fichero de reglas cargado conserva su "antes" en
 * una revisión de git, e imprime un informe bilingüe que nombra cada déficit. Sale 0 si se conserva, 1 si hay
 * déficit, 2 si no se midió (falta un argumento, un fichero ilegible, un fallo de git).
 */

import { NotMeasured, anchorsFor, beforeAt, evidenceIn, textOf } from './tiering-inputs.mjs';
import { tieringVerdict } from './tiering-verdict.mjs';

const REQUIRED = ['repo', 'rev', 'file', 'after', 'evidence'];

/** The `--name value` pairs of `argv`. @es Los pares `--nombre valor` de `argv`. */
function argumentsOf(argv) {
  const named = {};

  for (let at = 0; at + 1 < argv.length; at += 2) if (argv[at].startsWith('--')) named[argv[at].slice(2)] = argv[at + 1];

  const missing = REQUIRED.filter((name) => named[name] === undefined);

  if (missing.length > 0) throw new NotMeasured(`missing --${missing.join(', --')} @es falta --${missing.join(', --')}`);

  return named;
}

async function main(argv) {
  const { repo, rev, file, after, evidence } = argumentsOf(argv);
  const deficits = tieringVerdict({ before: beforeAt({ repo, rev, file }), after: textOf(after), evidence: evidenceIn(evidence), anchors: await anchorsFor({ repo, file }) });
  const subject = `${file} at ${rev} -> ${after}`;

  if (deficits.length === 0) {
    console.log(`rule-tiering: ${subject} is conserved. @es ${subject} se conserva.`);

    return 0;
  }

  console.log(`rule-tiering: ${subject} has ${deficits.length} deficit(s). @es ${subject} tiene ${deficits.length} déficit(s).`);

  for (const found of deficits) console.log(`  [${found.kind}] ${found.message}`);

  return 1;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof NotMeasured)) throw error;

  console.error(`rule-tiering NOT MEASURED — ${error.message}`);
  process.exitCode = 2;
}

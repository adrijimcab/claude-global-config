/**
 * The narrative store: where the full text of a shortened ledger line lives, `lessons/evidence/<key>.md`
 * beside the ledger, so one rule serves the home ledger and any project's. APPEND-ONLY: a block is added,
 * never rewritten, and a line already archived is not archived twice. The file is created with a header
 * only when it is new; a hand-written one is never touched except by appending.
 *
 * @es El almacén de la narrativa: dónde vive el texto completo de una línea acortada, `lessons/evidence/
 * <clave>.md` junto al ledger. Solo se AÑADE: un bloque se agrega y nunca se reescribe, y una línea ya
 * archivada no se archiva dos veces. El fichero lleva encabezado solo si es nuevo; uno escrito a mano solo
 * recibe añadidos.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { holdsWholeLine } from './conservation.mjs';
import { isDate, isValidKey } from './ledger-line.mjs';

/** Why a line is archived: shortened later, captured shortened, or promoted. @es Por qué se archiva una línea. */
export const EVIDENCE_KINDS = ['condensed', 'captured', 'promoted'];

/** The evidence file of `key` for the ledger at `ledgerFile`; the key must already be valid. @es El fichero de evidencia de `key`; la clave debe ser válida. */
export const evidenceFile = (ledgerFile, key) => path.join(path.dirname(ledgerFile), 'lessons', 'evidence', `${key}.md`);

/** The bilingual header of a new evidence file. @es El encabezado bilingüe de un fichero nuevo. */
const header = (key) => `# \`${key}\` — full evidence / evidencia completa\n\nLedger lines archived verbatim, append-only: each block is one original line, byte for byte. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte.\n`;

/** The evidence text as it is on disk, or `undefined` when it is absent or unreadable (a directory, say). @es El texto de la evidencia en disco, o `undefined` si falta o no se puede leer. */
export function readEvidence(ledgerFile, key) {
  try {
    return readFileSync(evidenceFile(ledgerFile, key), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Archives `line` verbatim under `key` and reports whether anything was written. A line that is already a
 * whole line of the file is not written again. The caller must RE-READ with `readEvidence` before it trusts
 * the archive.
 * @returns `{ ok: true, file, appended }` or `{ ok: false, problem }`, never throwing on a filesystem fault.
 * @es Archiva `line` literal bajo `key`. Una línea ya presente no se escribe otra vez. El llamante debe RELEER con `readEvidence` antes de fiarse.
 */
export function appendEvidence({ ledgerFile, key, line, date, kind }) {
  const fault = [
    isValidKey(key) ? undefined : 'the key must be lowercase kebab-case. @es la clave debe ser kebab-case en minúsculas.',
    EVIDENCE_KINDS.includes(kind) ? undefined : `the kind must be one of ${EVIDENCE_KINDS.join(', ')}. @es el tipo debe ser uno de ${EVIDENCE_KINDS.join(', ')}.`,
    isDate(date) ? undefined : 'the date must be YYYY-MM-DD. @es la fecha debe ser AAAA-MM-DD.',
    typeof line === 'string' && line.length > 0 && !line.includes('\n') && !line.includes('\r') ? undefined : 'the line must be one non-empty line. @es la línea debe ser una sola línea no vacía.',
  ].find((problem) => problem !== undefined);

  if (fault !== undefined) return { ok: false, problem: fault };

  const file = evidenceFile(ledgerFile, key);

  try {
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : undefined;

    if (existing !== undefined && holdsWholeLine(existing, line)) return { ok: true, file, appended: false };

    const block = `\n## Ledger line archived ${date} (${kind})\n\n${line}\n`;

    mkdirSync(path.dirname(file), { recursive: true });

    if (existing === undefined) writeFileSync(file, `${header(key)}${block}`, { encoding: 'utf8', flag: 'wx' });
    else appendFileSync(file, block, 'utf8');

    return { ok: true, file, appended: true };
  } catch (error) {
    return { ok: false, problem: `the evidence could not be written to ${file}: ${error instanceof Error ? error.message : String(error)}. @es no se pudo escribir la evidencia en ${file}.` };
  }
}

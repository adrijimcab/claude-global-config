/**
 * Rewrites a ledger's fat lines into their shortened form, losing nothing. Under the ledger lock it stores a
 * pre-image of each ledger, then for every planned line archives the WHOLE original to the evidence file,
 * RE-READS that file from disk and proves conservation (`conservation.mjs`) before the line may change; a line
 * that fails the proof stays byte-identical and is reported with its deficit. The ledger is written once and
 * read back: any difference from what was planned restores the pre-image. A dry run (no `write`) plans and
 * reports and touches nothing, not even the lock. A second run finds every line already short and changes
 * nothing. The hand-written promoted rules are not a ledger and are never a target.
 *
 * @es Reescribe las líneas gruesas de un ledger a su forma corta sin perder nada. Bajo el lock guarda una
 * imagen previa de cada ledger y, por cada línea planificada, archiva el ORIGINAL ENTERO en la evidencia, la
 * RELEE de disco y prueba la conservación antes de que la línea pueda cambiar; una línea que no pasa la
 * prueba queda idéntica byte a byte y se informa con su déficit. El ledger se escribe una vez y se relee:
 * cualquier diferencia con lo planificado restaura la imagen previa. Un simulacro (sin `write`) planifica e
 * informa sin tocar nada, ni siquiera el lock. Una segunda ejecución no cambia nada. Las reglas promovidas
 * escritas a mano no son un ledger y nunca son objetivo.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { planLedgers } from './condense-plan.mjs';
import { proveConservation } from './conservation.mjs';
import { appendEvidence, readEvidence } from './evidence.mjs';
import { joinBilingual } from './ledger-line.mjs';
import { withLock } from './ledger-lock.mjs';
import { writeText, writeVerified } from './verified-write.mjs';

/** What touches the disk, replaceable so a proof can make it lie. @es Lo que toca el disco, sustituible para que una prueba lo haga mentir. */
const REAL_IO = { appendEvidence, readEvidence, writeText };

/** A run id that sorts by time and cannot collide between two processes. @es Un id de ejecución que ordena por tiempo y no choca entre dos procesos. */
export const newRunId = () => `${new Date().toISOString().replaceAll(':', '-')}-${String(process.pid)}`;

/** The lines with each done item's shortened form in place. @es Las líneas con la forma corta de cada ítem hecho. */
const replaced = (lines, done) => lines.map((line, index) => done.find((item) => item.index === index)?.shortened ?? line);

/** Stores the ledger as it was and the plan, so a run can always be undone by hand. @es Guarda el ledger como era y el plan, para deshacer a mano. */
function storePreImage({ dir, scope, text, items }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${scope}.ledger`), text, 'utf8');
  writeFileSync(path.join(dir, `${scope}.plan.json`), JSON.stringify(items, null, 2), 'utf8');
}

/** Archives one original, re-reads the evidence from disk and proves the shortening. @es Archiva un original, relee la evidencia de disco y prueba el acortamiento. */
function proveItem({ io, file, item, date }) {
  const archived = io.appendEvidence({ ledgerFile: file, key: item.key, line: item.original, date, kind: 'condensed' });

  return archived.ok ? proveConservation({ original: item.original, shortened: item.shortened, evidence: io.readEvidence(file, item.key) }) : { ok: false, deficits: [archived.problem] };
}

/** Condenses (or, dry, only plans) one ledger: `{ scope, file, before, after, condensed, left, restored }`. @es Condensa (o solo planifica) un ledger. */
function condenseLedger({ ledger, items, write, date, preImageDir, io }) {
  const text = ledger.lines.join('\n');
  const left = items.filter((item) => item.reason !== undefined);
  const eligible = items.filter((item) => item.shortened !== undefined);
  const base = { scope: ledger.scope, file: ledger.file, before: text.length };

  if (!write || eligible.length === 0) return { ...base, after: replaced(ledger.lines, eligible).join('\n').length, condensed: eligible, left, restored: false };

  storePreImage({ dir: preImageDir, scope: ledger.scope, text, items });

  const proofs = eligible.map((item) => ({ item, proof: proveItem({ io, file: ledger.file, item, date }) }));
  const done = proofs.filter(({ proof }) => proof.ok).map(({ item }) => item);
  const failed = proofs.filter(({ proof }) => !proof.ok).map(({ item, proof }) => ({ ...item, reason: joinBilingual(proof.deficits) }));
  const next = replaced(ledger.lines, done).join('\n');
  const written = done.length === 0 || writeVerified({ io, file: ledger.file, text, next });

  return { ...base, after: written ? next.length : text.length, condensed: written ? done : [], left: [...left, ...failed].sort((a, b) => a.index - b.index), restored: !written };
}

/**
 * @param input `{ load, keyMap, write, date, runId, lockFile, preImageRoot, deps }` — `load()` returns the
 *   ledgers (`{ scope, file, lines }`) and is called under the lock, so a line another writer added is never lost.
 * @returns `{ status, held, write, problems, ledgers }`: status 0 clean, 1 a line was left unchanged or a write
 *   was restored, 2 the lock is held (nothing was changed).
 * @es `load()` devuelve los ledgers y se llama bajo el lock, así una línea que otro escritor añadió nunca se pierde.
 */
export function runCondense({ load, keyMap, write, date, runId, lockFile, preImageRoot, deps }) {
  const io = { ...REAL_IO, ...deps };
  const run = () => {
    const { plans, problems } = planLedgers({ ledgers: load(), keyMap });
    const ledgers = plans.map(({ ledger, items }) => condenseLedger({ ledger, items, write, date, preImageDir: path.join(preImageRoot, runId), io }));

    return { status: problems.length > 0 || ledgers.some((one) => one.left.length > 0 || one.restored) ? 1 : 0, held: false, write, problems, ledgers };
  };

  if (!write) return run();

  const locked = withLock(lockFile, run);

  return locked.held ? locked.value : { status: 2, held: true, write, problems: [], ledgers: [] };
}

/** The report, one bilingual line each: what was shortened, what stayed and why, sizes, and a key-map skeleton. @es El informe: qué se acortó, qué quedó y por qué, tamaños y un esqueleto del mapa de claves. */
export function describeOutcome(outcome) {
  if (outcome.held) return ['condense REFUSED — the ledger is locked by another writer; nothing was changed. @es condense RECHAZADO: el ledger está bloqueado por otro escritor; no se cambió nada.'];

  const verb = outcome.write ? ['shortened', 'acortadas'] : ['would be shortened', 'se acortarían'];
  const needKey = outcome.ledgers.flatMap((ledger) => ledger.left.filter((item) => item.needsKey));
  const report = outcome.ledgers.flatMap((ledger) => [
    `${ledger.scope} ledger ${ledger.file}: ${String(ledger.condensed.length)} of ${String(ledger.condensed.length + ledger.left.length)} eligible lines ${verb[0]}; ${String(ledger.before)} -> ${String(ledger.after)} characters. @es ledger ${ledger.scope}: ${String(ledger.condensed.length)} de ${String(ledger.condensed.length + ledger.left.length)} líneas elegibles ${verb[1]}; ${String(ledger.before)} -> ${String(ledger.after)} caracteres.`,
    ...ledger.left.map((item) => `  left unchanged, line ${String(item.index + 1)}: ${item.reason}`),
    ...(ledger.restored ? ['  RESTORED from the pre-image: the ledger read back differently from what was planned. @es RESTAURADO desde la imagen previa: el ledger releído difiere de lo planificado.'] : []),
  ]);

  return [
    ...report,
    ...outcome.problems.map((problem) => `  ${problem}`),
    ...(needKey.length === 0 ? [] : ['key-map skeleton for the lines that need a key (fill in "key"; "line" must stay 30+ characters and name one line). @es esqueleto del mapa de claves para las líneas que necesitan clave (completa "key"; "line" debe tener 30+ caracteres y nombrar una sola línea):', JSON.stringify({ keys: needKey.map((item) => ({ line: item.original.slice(0, 40), key: '' })) }, null, 2)]),
  ];
}

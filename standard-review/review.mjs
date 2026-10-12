#!/usr/bin/env node
/**
 * Reviews one work unit against the engineering standard with a FRESH model run and records the verdict by the
 * tree hash, so a landing can require it (`review-requirement.mjs`). The unit is `base..HEAD` of a worktree
 * (`unit.mjs`), the rubric is built from `~/.claude/engineering-standard.md` at run time (`rubric.mjs`), the
 * one model call is the judge gate's (`../judge-gate/model.mjs`, no second client), the answer is validated
 * (`findings.mjs`) and recorded (`verdict-store.mjs`). A tree that already holds a PASS is not reviewed again.
 *
 * `reviewUnit` is the ONE function a project's landing calls to review a unit; the model is injected for the
 * selftest. Exit of the command line: 0 pass, 1 fail (findings printed), 2 not reviewed (refusal or model failure).
 * Usage: node review.mjs --worktree <dir> --base <ref>
 *
 * @es Revisa una unidad de trabajo contra el estándar de ingeniería con una corrida de modelo NUEVA y registra el
 * veredicto por el hash del árbol, para que un aterrizaje pueda exigirlo. La unidad es `base..HEAD` de un
 * worktree, la rúbrica se arma en ejecución desde `~/.claude/engineering-standard.md`, la única llamada al modelo
 * es la de la compuerta de los jueces (sin segundo cliente), la respuesta se valida y se registra. Un árbol que
 * ya tiene un PASS no se revisa de nuevo. `reviewUnit` es la ÚNICA función que llama el aterrizaje de un
 * proyecto para revisar una unidad; el modelo se inyecta en el selftest. Salida: 0 pase, 1 fallo (con
 * hallazgos), 2 no revisado (rechazo o fallo del modelo).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claudeHome } from '../hook-state/locations.mjs';
import { askModel } from '../judge-gate/model.mjs';
import { readReview } from './findings.mjs';
import { buildPrompt, standardItemsOf } from './rubric.mjs';
import { unitOf } from './unit.mjs';
import { recordVerdict, verdictOf } from './verdict-store.mjs';

/** The model of the review: a design review needs more than the judges' cheap one. @es El modelo de la revisión. */
export const REVIEW_MODEL = 'sonnet';

/** Bound on one review run. @es Límite de una corrida de revisión. */
export const REVIEW_TIMEOUT_MS = 5 * 60 * 1000;

/** The one source of the rubric. @es La única fuente de la rúbrica. */
export const standardPath = () => path.join(claudeHome(), 'engineering-standard.md');

/**
 * @param {{ worktree: string, base: string, ask?: typeof askModel, standardFile?: string }} inputs
 * @returns {Promise<{ tree: string, verdict: 'pass' | 'fail', summary: string, findings: object[], costUsd: number, durationMs: number, reused: boolean }>}
 * @es Revisa la unidad y devuelve la revisión registrada; lanza un error bilingüe si no se pudo revisar.
 */
export async function reviewUnit({ worktree, base, ask = askModel, standardFile = standardPath() }) {
  const unit = unitOf({ worktree, base });
  const existing = verdictOf(unit.tree);

  if (existing?.verdict === 'pass') return { ...existing, reused: true };
  const standard = readFileSync(standardFile, 'utf8');
  const answered = await ask(buildPrompt({ standard, unit }), { timeoutMs: REVIEW_TIMEOUT_MS, model: REVIEW_MODEL });
  const review = readReview(answered.answer, { files: unit.files, items: standardItemsOf(standard) });
  const record = recordVerdict({ tree: unit.tree, base: unit.base, ...review, model: REVIEW_MODEL, costUsd: answered.costUsd, durationMs: answered.durationMs });

  return { ...record, reused: false };
}

/** The printed report of a review. @es El informe impreso de una revisión. */
function reportOf(review) {
  const head = review.verdict === 'pass' ? 'PASS' : 'FAIL';
  const origin = review.reused ? 'already recorded for this tree @es ya registrado para este árbol' : `$${review.costUsd.toFixed(4)}, ${(review.durationMs / 1000).toFixed(1)} s`;
  const findings = review.findings.map((finding) => `  ${finding.file}:${finding.line} [standard item ${finding.standard}] ${finding.why}`);

  return [`${head} tree ${review.tree} (${origin}): ${review.summary}`, ...findings].join('\n');
}

/** Reads `--worktree` and `--base`, in that order, once each. @es Lee `--worktree` y `--base`, en ese orden, una vez cada uno. */
function parse(argv) {
  const [first, worktree, second, base, ...rest] = argv;

  return first === '--worktree' && second === '--base' && worktree && base && rest.length === 0 ? { worktree: path.resolve(worktree), base } : undefined;
}

/**
 * Runs the command line: what it prints and its exit code. The model is injected for the selftest.
 * @es Ejecuta la línea de órdenes: lo que imprime y su código de salida. El modelo se inyecta en el selftest.
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
export async function runCommandLine(argv, ask = askModel) {
  const inputs = parse(argv);

  if (inputs === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'Usage: node review.mjs --worktree <dir> --base <ref>. @es Uso: node review.mjs --worktree <dir> --base <ref>.' };
  }
  try {
    const review = await reviewUnit({ ...inputs, ask });

    return { exitCode: review.verdict === 'pass' ? 0 : 1, stdout: reportOf(review), stderr: '' };
  } catch (error) {
    return { exitCode: 2, stdout: '', stderr: `NOT REVIEWED ${error.message}` };
  }
}

/** Runs the real command line. @es Ejecuta la línea de órdenes real. */
async function main() {
  const { exitCode, stdout, stderr } = await runCommandLine(process.argv.slice(2));

  if (stdout !== '') console.log(stdout);
  if (stderr !== '') console.error(stderr);

  return exitCode;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = await main();

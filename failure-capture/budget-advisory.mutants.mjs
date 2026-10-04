#!/usr/bin/env node
/**
 * The decisions of the budget advisory that follows a capture, each broken once, that
 * `budget-advisory.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 * A blind spot here makes a capture noisy when within budget, silent when over, or fragile: a budget failure
 * that changes the capture's exit status.
 *
 * @es Las decisiones del aviso de presupuesto que sigue a una captura, rotas una a una. Un punto ciego aquí
 * hace que una captura sea ruidosa dentro del presupuesto, muda si lo supera, o frágil: un fallo del
 * presupuesto que cambia el estado de salida de la captura.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const A = 'failure-capture/budget-advisory.mjs';
const R = 'failure-capture/budget-report.mjs';
const C = 'failure-capture/capture.mjs';

const MUTANTS = [
  // --- the module
  ['the advisory is printed when within budget', A, "if (verdict.status === 'within') return;", ''],
  ['nothing is ever printed', A, "if (verdict.status === 'within') return;", 'return;'],
  ['the condense does not run when over', A, 'for (const line of condense()) print(line);', ''],
  ['the condense runs before the advisory is printed', A, 'for (const line of renderAdvisory(verdict)) print(line);\n    for (const line of condense()) print(line);', 'const done = condense();\n    for (const line of renderAdvisory(verdict)) print(line);\n    for (const line of done) print(line);'],
  ['what the condense did is not printed', A, 'for (const line of condense()) print(line);', 'condense();'],
  ['a failing step is not swallowed', A, '  } catch (error) {', '  } catch (error) {\n    throw error;'],
  ['a failure is not printed', A, 'print(`budget advisory FAILED', 'void (`budget advisory FAILED'],
  ['the failure notice is English only', A, ' @es el aviso de presupuesto FALLÓ (la captura no se ve afectada): ${reason}.', ''],
  ['the failure notice drops the reason', A, '(the capture itself is unaffected): ${reason}. @es', '(the capture itself is unaffected). @es'],
  ['a thrown value that is not an Error is lost', A, 'error instanceof Error ? error.message : String(error)', 'error.message'],

  // --- the advisory text
  ['the advisory lists every file', R, 'verdict.files.slice(0, HEAVIEST)', 'verdict.files'],
  ['the advisory lists the lightest files', R, 'verdict.files.slice(0, HEAVIEST)', 'verdict.files.slice(-HEAVIEST)'],
  ['the advisory lists two files', R, 'const HEAVIEST = 3;', 'const HEAVIEST = 2;'],
  ['the advisory has no verdict line', R, "  verdictLine(verdict),\n  ...section('heaviest", "  ...section('heaviest"],
  ['the advisory is not bilingual', R, ' @es AVISO: el conjunto de instrucciones siempre cargado supera su techo.', ''],
  ['the condensing notice is gone', R, "  'condensing the ledger lines that need no operator input. @es condensando las líneas del ledger que no necesitan intervención del operador.'\n", ''],

  // --- the wiring in capture
  ['the advisory runs even when the capture was refused', C, 'if (status === 0) {\n    adviseOnBudget', 'if (true) {\n    adviseOnBudget'],
  ['the advisory never runs', C, 'if (status === 0) {\n    adviseOnBudget', 'if (false) {\n    adviseOnBudget'],
  ['the budget decides the capture\'s exit status', C, '  return status;\n}\n\nfunction recordCapture', '  return 1;\n}\n\nfunction recordCapture'],
  ['the condense runs as a dry run', C, 'keyMap: [], write: true })', 'keyMap: [], write: false })'],
  ['the condense is given a key map it was never handed', C, 'keyMap: [], write: true', 'keyMap: undefined, write: true'],
  ['the project ceiling is ignored by the advisory', C, 'measureLoadedSet({ project: PROJECT, directory: process.cwd(), ceiling: args.ceiling }).verdict', 'measureLoadedSet({ project: undefined, directory: process.cwd(), ceiling: args.ceiling }).verdict'],
  ['the advisory walks past the ceiling', C, 'directory: process.cwd(), ceiling: args.ceiling }).verdict', 'directory: process.cwd(), ceiling: undefined }).verdict'],
  ['the condense report is not printed', C, 'condense: () => describeOutcome(condenseLedgers(', 'condense: () => (condenseLedgers('],
  ['the advisory prints nowhere', C, 'print: (line) => speaker.data(line)', 'print: () => undefined']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/budget-advisory.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);

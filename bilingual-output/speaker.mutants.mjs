#!/usr/bin/env node
/**
 * The decisions of the speaker (`speaker.mjs`), each broken once, that `speaker.selftest.mjs` must catch.
 * The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del speaker, rotas una a una; las debe cazar `speaker.selftest.mjs`. El runner y sus
 * reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const SPEAKER = 'bilingual-output/speaker.mjs';

const MUTANTS = [
  ['say prints on the error stream', SPEAKER, 'say: (id, params) => sink.log(line(id, params)),', 'say: (id, params) => sink.error(line(id, params)),'],
  ['complain prints on the output stream', SPEAKER, 'complain: (id, params) => sink.error(line(id, params)),', 'complain: (id, params) => sink.log(line(id, params)),'],
  ['an unknown id is not refused', SPEAKER, 'if (!Object.hasOwn(table, id)) throw', 'if (false) throw'],
  ['an inherited property counts as a message', SPEAKER, 'if (!Object.hasOwn(table, id)) throw', 'if (!(id in table)) throw'],
  ['the data line goes through the renderer', SPEAKER, 'data: (text) => sink.log(text),', 'data: (text) => sink.log(line(text)),'],
  ['dataError prints on the output stream', SPEAKER, 'dataError: (text) => sink.error(text),', 'dataError: (text) => sink.log(text),'],
  ['blank prints nothing', SPEAKER, "blank: () => sink.log(''),", 'blank: () => undefined,'],
  ['the message is printed without its parameters', SPEAKER, 'return render(table[id], params);', 'return render(table[id]);'],
  ['a table that is not bilingual is loaded', SPEAKER, 'if (problems.length > 0) throw', 'if (false) throw'],
  ['the table is not checked at load', SPEAKER, 'const problems = messageProblems(table);', 'const problems = [];']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['bilingual-output', 'mutation-proof'],
  selftest: 'bilingual-output/speaker.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);

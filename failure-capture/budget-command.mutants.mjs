#!/usr/bin/env node
/**
 * The decisions of the `budget` command and its report, each broken once, that `budget-command.selftest.mjs`
 * must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here makes the
 * command pass an over-size set, hide a file or a gap, or exit with the wrong status.
 *
 * @es Las decisiones del comando `budget` y de su informe, rotas una a una. Un punto ciego aquí hace que el
 * comando deje pasar un conjunto demasiado grande, oculte un fichero o un hueco, o salga con el estado errado.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'failure-capture/budget-report.mjs';
const C = 'failure-capture/capture.mjs';
const EXIT = "verdict.status === 'within' ? 0 : 1";

const MUTANTS = [
  // --- the report
  ['a within verdict reads OVER', R, "${within ? 'WITHIN' : 'OVER'}", "${within ? 'OVER' : 'WITHIN'}"],
  ['a within verdict reads EXCEDIDO in Spanish', R, "${within ? 'DENTRO' : 'EXCEDIDO'}", "${within ? 'EXCEDIDO' : 'DENTRO'}"],
  ['the deciding ceiling is always called global', R, "(${project ? 'project' : 'global'} ceiling)", '(global ceiling)'],
  ['the Spanish name of the project ceiling is wrong', R, "(techo ${project ? 'del proyecto' : 'global'})", '(techo global)'],
  ['numbers lose their thousands separators', R, "const number = (value) => value.toLocaleString('en-US');", 'const number = (value) => String(value);'],
  ['the counted total is shown as the raw one', R, 'harness-counted ${number(verdict.countedTotal)}', 'harness-counted ${number(verdict.rawTotal)}'],
  ['the margin is left out', R, ', margin ${number(verdict.margin)}. @es', '. @es'],
  ['the Spanish half of the verdict line is dropped', R, ' @es presupuesto ${within', ' presupuesto ${within'],
  ['the files by weight are not listed', R, 'verdict.files.map(fileEntry)', '[]'],
  ['a file is shown without its counted size', R, '${number(file.raw)} / ${number(file.counted)}  ${file.path}', '${number(file.raw)}  ${file.path}'],
  ['an empty section still prints its heading', R, "entries.length === 0 ? [] : [heading", "false ? [] : [heading"],
  ['section entries lose their indentation', R, '...entries.map((entry) => `  ${entry}`)', '...entries'],
  ['the per-file limit is not reported', R, 'verdict.overPerFile.map((file) => `${number(file.counted)}  ${file.path}`)', '[]'],
  ['the per-file limit shown is zero', R, 'const limit = verdict.overPerFile[0]?.limit;', 'const limit = undefined;'],
  ['the missing imports are not reported', R, 'missing.map((gap) => `${gap.file} (imported by ${gap.importedBy})`)', '[]'],
  ['a missing import hides who imported it', R, ' (imported by ${gap.importedBy})', ''],
  ['the missing heading is not marked informational', R, 'missing imports (informational: the harness makes the same lookups; not part of the verdict).', 'missing imports.'],
  ['the unmeasured text is not bilingual', R, 'budget NOT MEASURED. @es presupuesto NO MEDIDO.\\n', 'budget NOT MEASURED.\\n'],
  ['the unmeasured text drops the cause', R, '\\n${reason}`', '`'],

  // --- the command
  ['an over-size set exits 0', C, EXIT, '0'],
  ['a within set exits 1', C, EXIT, '1'],
  ['an unmeasurable set exits 1', C, 'speaker.dataError(renderUnmeasured(error instanceof Error ? error.message : String(error)));\n\n    return 2;', 'speaker.dataError(renderUnmeasured(error instanceof Error ? error.message : String(error)));\n\n    return 1;'],
  ['an unmeasurable set exits 0', C, 'speaker.dataError(renderUnmeasured(error instanceof Error ? error.message : String(error)));\n\n    return 2;', 'speaker.dataError(renderUnmeasured(error instanceof Error ? error.message : String(error)));\n\n    return 0;'],
  ['the cause of an unmeasurable set goes to stdout', C, 'speaker.dataError(renderUnmeasured(', 'speaker.data(renderUnmeasured('],
  ['a project directory that does not exist is measured anyway', C, 'if (!existsSync(directory)) throw', 'if (false) throw'],
  ['--project is ignored', C, "typeof args.project === 'string' ? path.resolve(args.project) : process.cwd()", 'process.cwd()'],
  ['the project ceiling is ignored', C, 'projectCeiling: project?.loadedSetCeiling', 'projectCeiling: undefined'],
  ['--ceiling is ignored', C, "ceiling: typeof ceiling === 'string' ? path.resolve(ceiling) : undefined", 'ceiling: undefined'],
  ['the missing imports are not passed to the report', C, 'renderBudget({ verdict, missing: loaded.missing })', 'renderBudget({ verdict, missing: [] })'],
  ['the home is not the process home', C, 'loadedSet({ home: homedir(),', "loadedSet({ home: path.join(homedir(), 'nowhere'),"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/budget-command.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);

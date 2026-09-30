#!/usr/bin/env node
/**
 * The decisions of the budget verdict, each broken once, that `budget-verdict.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here lets an over-size set
 * pass, or raises a false alarm.
 *
 * @es Las decisiones del veredicto de presupuesto, rotas una a una. Un punto ciego aquí deja pasar un conjunto
 * demasiado grande o da una falsa alarma.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'failure-capture/budget-verdict.mjs';
const PROJECT_DECIDES = 'projectCeiling !== undefined && projectCeiling < globalCeiling';
const STATUS = "loaded.rawTotal <= ceiling ? 'within' : 'over'";

const MUTANTS = [
  ['the global ceiling is 150,000', FILE, 'export const GLOBAL_CEILING = 147_000;', 'export const GLOBAL_CEILING = 150_000;'],
  ['the verdict is never over', FILE, STATUS, "'within'"],
  ['the verdict is always over', FILE, STATUS, "'over'"],
  ['a set exactly at the ceiling is over', FILE, STATUS, "loaded.rawTotal < ceiling ? 'within' : 'over'"],
  ['a set one over the ceiling is within', FILE, STATUS, "loaded.rawTotal <= ceiling + 1 ? 'within' : 'over'"],
  ['the verdict follows the counted total', FILE, STATUS, "loaded.countedTotal <= ceiling ? 'within' : 'over'"],
  ['the project ceiling is ignored', FILE, PROJECT_DECIDES, 'false'],
  ['the project ceiling always decides', FILE, PROJECT_DECIDES, 'projectCeiling !== undefined'],
  ['a looser project ceiling relaxes the global one', FILE, PROJECT_DECIDES, 'projectCeiling !== undefined && projectCeiling > globalCeiling'],
  ['a project ceiling equal to the global one is credited to the project', FILE, PROJECT_DECIDES, 'projectCeiling !== undefined && projectCeiling <= globalCeiling'],
  ['an explicit global ceiling is ignored', FILE, 'projectCeiling, globalCeiling = GLOBAL_CEILING, contextTokens }) {', 'projectCeiling, contextTokens }) {\n  const globalCeiling = GLOBAL_CEILING;'],
  ['the deciding source is always global', FILE, "source: projectDecides ? 'project' : 'global'", "source: 'global'"],
  ['the margin is reversed', FILE, 'margin: ceiling - loaded.rawTotal', 'margin: loaded.rawTotal - ceiling'],
  ['the margin is measured on the counted total', FILE, 'margin: ceiling - loaded.rawTotal', 'margin: ceiling - loaded.countedTotal'],
  ['the raw total is not reported', FILE, 'rawTotal: loaded.rawTotal,', 'rawTotal: 0,'],
  ['the counted total is not reported', FILE, 'countedTotal: loaded.countedTotal,', 'countedTotal: 0,'],
  ['files are listed lightest first', FILE, 'right.raw - left.raw ||', 'left.raw - right.raw ||'],
  ['ties are not broken by path', FILE, ' || left.path.localeCompare(right.path)', ''],
  ['files are not sorted', FILE, '.sort(byWeightThenPath)', ''],
  ['the input list is sorted in place', FILE, 'loaded.files.map(({ path, raw, counted }) => ({ path, raw, counted })).sort', 'loaded.files.sort'],
  ['a file over the per-file limit is not reported', FILE, '!countsTowardTotal(file.counted, limits)', 'false'],
  ['every file is reported as over the per-file limit', FILE, '!countsTowardTotal(file.counted, limits)', 'true'],
  ['the per-file check follows the raw size', FILE, '!countsTowardTotal(file.counted, limits)', '!countsTowardTotal(file.raw, limits)'],
  ['the context size is not passed to the limits', FILE, 'harnessLimits({ contextTokens })', 'harnessLimits({})'],
  ['the reported limit is the total limit', FILE, 'limit: limits.perFile', 'limit: limits.total'],
  ['an over-limit file changes the verdict', FILE, STATUS, "loaded.rawTotal <= ceiling && files.every((file) => file.counted <= limits.perFile) ? 'within' : 'over'"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/budget-verdict.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);

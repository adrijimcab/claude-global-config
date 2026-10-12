#!/usr/bin/env node
/**
 * The mutation SCOPE of THIS repository: every module that decides has a mutants campaign that mutates it.
 * This is the enforcement of the demand "mutants where the decisions are": the selftest runner discovers this
 * file, so a deciding module added without a campaign (a new guard in a manifest, a new `decide.mjs`) turns
 * the runner, and every gate that runs it, RED, naming the module and why it is demanded.
 *
 * It measures the repository this copy sits in, as the command `scope.mjs` does. When the selftest runner names
 * that tree's repository (`SELFTEST_GIT_DIR`, set from its `--git-dir` for a tooling tree its code repository
 * ignores), the population is listed from it; otherwise from the repository that holds the tree. How each decision is made is
 * proved over constructed trees by `scope.selftest.mjs`. Campaigns over modules that do not decide are
 * information only and never fail this file. The campaigns themselves are not run here (that is
 * `mutants-all`): this proves they EXIST for every decision, not that they are green.
 *
 * @es El ALCANCE de mutación de ESTE repositorio: todo módulo que decide tiene una campaña de mutantes que lo
 * muta. Es el cumplimiento de la exigencia «mutantes donde están las decisiones»: el corredor de selftests
 * descubre este fichero, así que un módulo que decide añadido sin campaña (una guardia nueva en un manifiesto,
 * un `decide.mjs` nuevo) pone en ROJO al corredor, nombrando el módulo y por qué se exige. Las campañas sobre
 * módulos que no deciden son solo información. Las campañas no se corren aquí: se prueba que EXISTEN para cada
 * decisión, no que estén en verde.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureRepository, renderScope } from './scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let total = 0;

function expect(name, predicate) {
  total += 1;

  if (predicate) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name} @es FALLO ${name}`);
  }
}

// The repository the runner was told holds this tree, or none: `-C` then finds the one that holds it.
// @es El repositorio que el runner dice que contiene este árbol, o ninguno: entonces `-C` encuentra el que lo contiene.
const gitDir = process.env.SELFTEST_GIT_DIR || undefined;
const scope = await measureRepository(ROOT, { gitDir });
const shown = renderScope(scope).filter((line) => !line.startsWith('OPTIONAL'));

expect('every campaign could be planned and every deciding module could be found', scope.problems.length === 0);
expect('every deciding module has a mutants campaign that mutates it', scope.gaps.length === 0);
expect('the measure is not vacuous: the repository holds deciding modules, and some are covered', scope.deciding.length > 0 && scope.deciding.some((entry) => entry.campaigns.length > 0));

if (scope.problems.length > 0 || scope.gaps.length > 0) for (const line of shown) console.log(`  ${line}`);

console.log(`INFO ${scope.deciding.length} deciding module(s); ${scope.optional.length} other module(s) are mutated without deciding (optional, \`node mutation-proof/scope.mjs\` lists them) @es ${scope.deciding.length} módulo(s) que deciden; ${scope.optional.length} más se mutan sin decidir (opcional)`);
console.log(`\n${passed}/${total} passed @es ${passed}/${total} correctas`);
process.exit(passed === total ? 0 : 1);

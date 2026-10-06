#!/usr/bin/env node
/**
 * Proof that the per-major angular-eslint rule table DISCRIMINATES. State space: each covered major's exact
 * rule set, split between the TypeScript and the template plugin, every rule an error; the majors beside the
 * table (18, 23) and a major that is not an integer, which must throw; the angular-eslint version reader on an
 * exact version and on text that is not one. That a rule is absent from an installed plugin is proven by the
 * live gate itself (`angular/angular-eslint-rules`): ESLint stops on a configured rule it cannot find.
 *
 * @es Prueba de que la tabla de reglas de angular-eslint por major DISCRIMINA: el conjunto exacto de cada major,
 * repartido entre el plugin de TypeScript y el de plantillas, cada regla como error; las majors vecinas y una
 * no entera, que deben lanzar; y el lector de versión de angular-eslint.
 */

import { LINT_MAJORS, RULE_TABLE, angularRulesFor, majorOfAngularEslint } from './angular-lint-rules.mjs';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** True when `run` throws. @es Verdadero si `run` lanza. */
function throws(run) {
  try {
    run();

    return false;
  } catch {
    return true;
  }
}

const P = '@angular-eslint/';
const EXPECTED = {
  19: { ts: ['prefer-signals'], template: [] },
  20: { ts: ['no-developer-preview', 'no-experimental', 'prefer-host-metadata-property', 'prefer-inject', 'prefer-signals'], template: ['prefer-control-flow'] },
  21: { ts: ['no-developer-preview', 'no-experimental', 'prefer-host-metadata-property', 'prefer-inject', 'prefer-signals'], template: ['prefer-control-flow'] },
  22: { ts: ['no-developer-preview', 'no-experimental', 'prefer-host-metadata-property', 'prefer-inject', 'prefer-service-decorator', 'prefer-signals'], template: ['prefer-control-flow'] },
};

for (const major of Object.keys(EXPECTED).map(Number)) {
  const { ts, template } = angularRulesFor(major);
  const want = EXPECTED[major];

  check(`Angular ${major} turns on exactly its TypeScript rules`, Object.keys(ts).sort().join() === want.ts.map((rule) => `${P}${rule}`).join());
  check(`Angular ${major} turns on exactly its template rules`, Object.keys(template).sort().join() === want.template.map((rule) => `${P}template/${rule}`).join());
  check(`every rule on for Angular ${major} is an error`, [...Object.values(ts), ...Object.values(template)].every((level) => level === 'error'));
}

check('the covered majors are 19 to 22', LINT_MAJORS.join() === '19,20,21,22');
check('every rule of the table is on for Angular 22', RULE_TABLE.length === Object.keys(angularRulesFor(22).ts).length + Object.keys(angularRulesFor(22).template).length);
check('a template rule is never handed to the TypeScript plugin', !Object.keys(angularRulesFor(22).ts).some((rule) => rule.includes('/template/')));
check('Angular 18 throws instead of taking 19\'s rules', throws(() => angularRulesFor(18)));
check('Angular 23 throws instead of taking 22\'s rules', throws(() => angularRulesFor(23)));
check('a major given as a string throws', throws(() => angularRulesFor('21')));
check('the major of angular-eslint 21.4.0 is 21', majorOfAngularEslint('21.4.0') === 21);
check('the major of angular-eslint 19.8.1 is 19', majorOfAngularEslint('19.8.1') === 19);
check('a version that is not three parts throws', throws(() => majorOfAngularEslint('21.4')));
check('a version that is not a number throws', throws(() => majorOfAngularEslint('next.1.0')));

if (failures.length > 0) {
  console.error(`gates-kit angular-lint-rules selftest FAILED @es el selftest de angular-lint-rules de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit angular-lint-rules selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);

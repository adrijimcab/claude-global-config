#!/usr/bin/env node
/**
 * Proof of the condense plan (`condense-plan.mjs`): what each kind of ledger line becomes, what stays and why,
 * and how an operator key map is accepted or refused. Pure text fixtures (`condense-fixtures.mjs`); no file is
 * read or written, and nothing here touches the real ledger.
 *
 * @es Prueba del plan de condensación: en qué se convierte cada tipo de línea, qué se queda y por qué, y cómo
 * se acepta o se rechaza un mapa de claves del operador. Fixtures de texto puro; no se lee ni se escribe
 * ningún fichero y nada toca el ledger real.
 */

import { planLedgers, planLine } from './condense-plan.mjs';
import { FAT_MECHANISM, FAT_NONE, HOOKS_KEY, KEYED, MARKERLESS, PROJECT_KEY, PROMOTED_MARKERLESS, PROJECT_LINE, PROJECT_MARKERLESS, SHORT_KEYED, SHORT_MARKERLESS, SHORT_PROJECT, SHORT_PROJECT_MARKERLESS, STUB_MECHANISM, STUB_NONE, TIERED_BARE, TWIN, TWO_LABELS } from './condense-fixtures.mjs';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 400)}`}`);
}

// --- one line ------------------------------------------------------------------------------------------
const keyed = planLine(KEYED, undefined);

check('a keyed [global] line plans its tiered form under the key of its own marker', keyed?.key === 'signal-lesson' && keyed.shortened === SHORT_KEYED, JSON.stringify(keyed));
check('a promoted line plans a stub that names the mechanism path its text holds', planLine(FAT_MECHANISM, undefined)?.shortened === STUB_MECHANISM, JSON.stringify(planLine(FAT_MECHANISM, undefined)));
check('...and one that closed with no mechanism plans the no-mechanism stub', planLine(FAT_NONE, undefined)?.shortened === STUB_NONE, JSON.stringify(planLine(FAT_NONE, undefined)));

const needsKey = planLine(MARKERLESS, undefined);
const withKey = planLine(MARKERLESS, HOOKS_KEY);

check('a marker-less line with no operator key stays, flagged as needing one, with its reason in both languages', needsKey?.needsKey === true && needsKey.shortened === undefined && needsKey.reason.includes('no key-map entry names a key') && needsKey.reason.includes(' @es '), JSON.stringify(needsKey));
check('...with an operator key it plans the tiered form under that key and invents no marker', withKey?.key === HOOKS_KEY && withKey.shortened === SHORT_MARKERLESS && !withKey.shortened.includes('<!--fc:'), JSON.stringify(withKey));
check('a line with two RULE: labels stays, and says so in both languages', planLine(TWO_LABELS, undefined)?.reason.includes('more than one "RULE: " label') === true && planLine(TWO_LABELS, undefined).reason.includes('más de una etiqueta'), JSON.stringify(planLine(TWO_LABELS, undefined)));
check('an entry that cannot be read stays with its reason: it is never skipped in silence', planLine('- [global] garbage', undefined)?.reason.includes('no "[scope] date — " head') === true, JSON.stringify(planLine('- [global] garbage', undefined)));

for (const [name, line] of [['a header line', '---'], ['a line already shortened', TIERED_BARE], ['a stub already minimal', STUB_MECHANISM]]) {
  check(`${name} is not this command's business`, planLine(line, undefined) === undefined);
}

// --- a project ledger's lines go through the same path as a global one ---------------------------------
const projectKeyed = planLine(PROJECT_LINE, undefined);
const projectNeedsKey = planLine(PROJECT_MARKERLESS, undefined);
const projectWithKey = planLine(PROJECT_MARKERLESS, PROJECT_KEY);

check('a keyed line of a project scope plans its tiered form under its own scope and the key of its marker', projectKeyed?.key === 'project-one' && projectKeyed.shortened === SHORT_PROJECT, JSON.stringify(projectKeyed));
check('a marker-less project line with no operator key stays, flagged as needing one', projectNeedsKey?.needsKey === true && projectNeedsKey.shortened === undefined, JSON.stringify(projectNeedsKey));
check('...with an operator key it plans the tiered form under that key and invents no marker', projectWithKey?.key === PROJECT_KEY && projectWithKey.shortened === SHORT_PROJECT_MARKERLESS && !projectWithKey.shortened.includes('<!--fc:'), JSON.stringify(projectWithKey));

// --- a key map, resolved against the ledgers -------------------------------------------------------------
const LINES = [MARKERLESS, TWIN, KEYED, TIERED_BARE, PROMOTED_MARKERLESS];
const plan = (keyMap, lines = LINES) => planLedgers({ ledgers: [{ scope: 'global', file: 'ledger.md', lines }], keyMap });
const shortened = (result) => result.plans[0].items.filter((item) => item.shortened !== undefined).map((item) => item.original);
const good = plan([{ line: MARKERLESS.slice(0, 60), key: HOOKS_KEY }]);

check('a prefix naming exactly one marker-less line under a fresh key shortens it, with no problem', good.problems.length === 0 && shortened(good).join() === [MARKERLESS, KEYED].join(), JSON.stringify(good.problems));
check('...the same map against a ledger where an earlier run already applied it is skipped, not a problem', plan([{ line: MARKERLESS.slice(0, 60), key: HOOKS_KEY }], [SHORT_MARKERLESS, KEYED]).problems.length === 0);

for (const [name, keyMap, english, spanish] of [
  ['a prefix matching two lines is AMBIGUOUS', [{ line: MARKERLESS.slice(0, 40), key: 'some-key' }], 'matches 2 marker-less lines (AMBIGUOUS)', 'coincide con 2 líneas sin marcador'],
  ['a prefix matching no line is ABSENT', [{ line: 'x'.repeat(40), key: 'some-key' }], 'matches no marker-less line (ABSENT)', 'no coincide con ninguna línea sin marcador'],
  ['a fragment from the middle of a line is not a prefix', [{ line: MARKERLESS.slice(10, 70), key: 'some-key' }], '(ABSENT)', 'no coincide con ninguna'],
  ['a prefix naming a line that already has a marker is ABSENT', [{ line: KEYED.slice(0, 60), key: 'some-key' }], '(ABSENT)', 'no coincide con ninguna'],
  ['a prefix naming an already shortened line is ABSENT', [{ line: TIERED_BARE.slice(0, 60), key: 'some-key' }], '(ABSENT)', 'no coincide con ninguna'],
  ['a prefix naming a promoted line that has no marker is ABSENT', [{ line: PROMOTED_MARKERLESS.slice(0, 60), key: 'some-key' }], '(ABSENT)', 'no coincide con ninguna'],
  ['a prefix under 30 characters is refused', [{ line: MARKERLESS.slice(0, 29), key: 'some-key' }], 'at least 30 characters', 'al menos 30 caracteres'],
  ['an entry that is not an object is refused', [null], 'at least 30 characters', 'al menos 30 caracteres'],
  ['a key that is not kebab-case is refused', [{ line: MARKERLESS.slice(0, 60), key: 'Bad Key' }], 'lowercase kebab-case', 'kebab-case en minúsculas'],
  ['a key already carried by a marker is refused', [{ line: MARKERLESS.slice(0, 60), key: 'signal-lesson' }], 'already carried by a marker', 'ya la lleva un marcador'],
  ['a key used by two entries is refused', [{ line: MARKERLESS.slice(0, 60), key: 'dup-key' }, { line: TWIN.slice(0, 60), key: 'dup-key' }], 'more than one key-map entry', 'más de una entrada del mapa de claves'],
]) {
  const result = plan(keyMap);
  const [first] = result.problems;

  check(`${name}: one problem naming its entry, in both languages, and no line shortened for it`, result.problems.length === keyMap.length && first.startsWith('key-map entry 1:') && first.includes(english) && first.includes(` @es `) && first.includes(spanish) && shortened(result).join() === KEYED, result.problems.join('\n'));
}

// a key map names a marker-less line of a project ledger too, in the ledger it is in
const projectPlan = planLedgers({ ledgers: [{ scope: 'global', file: 'ledger.md', lines: [KEYED] }, { scope: 'b100-am-ui', file: 'project.md', lines: [PROJECT_MARKERLESS, PROJECT_LINE] }], keyMap: [{ line: PROJECT_MARKERLESS.slice(0, 60), key: PROJECT_KEY }] });
const projectShortened = projectPlan.plans[1].items.filter((item) => item.shortened !== undefined).map((item) => item.shortened);

check('a prefix naming a marker-less line of a project ledger shortens it there, with no problem', projectPlan.problems.length === 0 && projectShortened.join() === [SHORT_PROJECT_MARKERLESS, SHORT_PROJECT].join(), JSON.stringify(projectPlan.problems));

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture condense plan selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Self-test for `tenancy-declaration.mjs`: which checkout a `TENANCY` line declares.
 *
 * It exists because the reader credited every checkout a TENANCY line mentioned ANYWHERE, by substring.
 * Measured 2026-10-18 by the master session on a real brief: the line that sent a worker into `e2e-uc` also
 * listed `chain, frame, icons, net, pdt` as checkouts the worker must NOT touch, and `declarationOf` called
 * each of them `present`. `agent-liveness` joins non-isolated workers with that answer, so `worktree-tenancy`
 * refused another session's commits. The fixtures below are that line, verbatim, and the shapes the other
 * consumers already rely on (the refusal's own suggested form, the takeover brief, the incident replay).
 *
 * @es Self-test de `tenancy-declaration.mjs`: qué checkout declara una línea `TENANCY`. Existe porque el
 * lector acreditaba todo checkout que la línea mencionara EN CUALQUIER SITIO, por subcadena; medido el
 * 2026-10-18 por la sesión maestra sobre un brief real cuya lista de exclusiones salía `present`.
 */

import { checkoutName, declarationOf, tenancyLines } from './tenancy-declaration.mjs';

let assertions = 0;
let failures = 0;

function check(ok, label) {
  assertions += 1;
  if (ok) return;

  failures += 1;
  console.error(`FAIL ${label} @es FALLO ${label}`);
}

const PROJECTS = 'C:/Users/adrian.jimenez/Desktop/Projects';
const WORKTREES = `${PROJECTS}/di-1700002-discovery-fe/.claude/worktrees`;
const PLUGIN_ESLINT = `${PROJECTS}/plugin-eslint`;
const BACK = '\\';

// ── 1. THE MEASURED LINE: the path declares, the exclusion list after it is prose ──────────────────

const MEASURED =
  `TENANCY: you work ONLY in ${WORKTREES}/e2e-uc (branch test/e2e-rescue-e5-e6). Never change worktree, never touch the main checkout or another worktree (chain, frame, icons, net, pdt belong to other live writers).`;

check(declarationOf(MEASURED, `${WORKTREES}/e2e-uc`) === 'present', 'the measured line declares e2e-uc by its full path');
check(declarationOf(MEASURED, 'e2e-uc') === 'present', 'the measured line declares e2e-uc by its name');

for (const forbidden of ['chain', 'frame', 'icons', 'net', 'pdt']) {
  check(declarationOf(MEASURED, forbidden) === 'unnamed', `the measured line does NOT declare the forbidden ${forbidden}`);
  check(declarationOf(MEASURED, `${WORKTREES}/${forbidden}`) === 'unnamed', `nor the forbidden ${forbidden} by its full path`);
}

check(declarationOf(MEASURED, 'e2e-rescue') === 'unnamed', 'the branch name does not declare a checkout named by its prefix (e2e-rescue)');
check(declarationOf(MEASURED, 'e2e-rescue-e5-e6') === 'unnamed', 'nor a checkout named by its last segment: a branch is not a checkout path');
check(declarationOf(MEASURED, 'test') === 'unnamed', 'nor one named by its first segment');
check(declarationOf(MEASURED, 'main') === 'unnamed', 'the measured line does not declare a checkout named `main` from the prose "main checkout"');
check(declarationOf(MEASURED, 'nonexistent-xyz') === 'unnamed', 'the measured line does not declare a checkout it never mentions');

// ── 2. A PATH-FREE LINE: whole words declare, by equality ──────────────────────────────────────────

check(declarationOf('TENANCY: b100-am-ui', 'b100-am-ui') === 'present', 'a bare name declares its checkout');
check(declarationOf('TENANCY: b100-am-ui', `${PROJECTS}/b100-am-ui`) === 'present', 'a bare name declares the checkout whose last segment it is');
check(declarationOf('TENANCY: B100-AM-UI', 'b100-am-ui') === 'present', 'case does not matter');
check(declarationOf('TENANCY: plugin-eslint, plugin-stylelint', 'plugin-stylelint') === 'present', 'a comma separates two declared names');
check(declarationOf('TENANCY: plugin-eslint, plugin-stylelint', 'plugin-eslint') === 'present', 'the name before the comma is declared too');
check(declarationOf('TENANCY: plugin-eslint; plugin-stylelint', 'plugin-eslint') === 'present', 'a semicolon separates two declared names');
check(declarationOf('TENANCY:\tplugin-eslint', 'plugin-eslint') === 'present', 'a tab separates like a space');

// ── 3. NO PARTIAL NAMES: equality, never substring ─────────────────────────────────────────────────

check(declarationOf('TENANCY: network', 'net') === 'unnamed', 'a name that merely STARTS another word is not declared (net in network)');
check(declarationOf('TENANCY: subnet', 'net') === 'unnamed', 'nor one that ENDS another word');
check(declarationOf(`TENANCY: ${WORKTREES}/network`, 'net') === 'unnamed', 'nor one that is part of a path segment');
check(declarationOf(`TENANCY: ${WORKTREES}/net-old/x`, 'net') === 'unnamed', 'a path declares its LAST segment only');
check(declarationOf('TENANCY: plugin-eslint', 'eslint') === 'unnamed', 'a hyphenated name is one word');

// ── 4. PUNCTUATION AROUND A PATH, both separators ──────────────────────────────────────────────────

const BACKSLASH_PATH = ['C:', 'Users', 'dev', 'repo', '.claude', 'worktrees', 'agent-aaa'].join(BACK);

check(declarationOf(`TENANCY: inside (${BACKSLASH_PATH})`, 'agent-aaa') === 'present', 'a backslash path closed by `)` declares its last segment');
check(declarationOf(`TENANCY: inside ${BACKSLASH_PATH}.`, 'agent-aaa') === 'present', 'a backslash path closed by `.` declares its last segment');
check(declarationOf(`TENANCY: inside ${BACKSLASH_PATH}.`, 'C:/Users/dev/repo/.claude/worktrees/agent-aaa') === 'present', 'a backslash path declares the same checkout spelled with slashes');
check(declarationOf(`TENANCY: inside \`${BACKSLASH_PATH}\`, on its branch`, 'agent-aaa') === 'present', 'a backtick-quoted path declares');
check(declarationOf(`TENANCY: "${PLUGIN_ESLINT}/";`, 'plugin-eslint') === 'present', 'a quoted path with a trailing slash declares its last segment');
check(declarationOf(`TENANCY: [${PLUGIN_ESLINT}]`, 'plugin-eslint') === 'present', 'a bracketed path declares');
check(declarationOf(`TENANCY: {${PLUGIN_ESLINT}}`, 'plugin-eslint') === 'present', 'a braced path declares');
check(declarationOf(`TENANCY: '${PLUGIN_ESLINT}'`, 'plugin-eslint') === 'present', 'a single-quoted path declares');
check(declarationOf('TENANCY: plugin-eslint.', 'plugin-eslint') === 'present', 'a bare name closed by a period declares');

// ── 4b. WHAT A PATH IS: absolute, or under `worktrees`; any other slash is prose ───────────────────

check(declarationOf('TENANCY: C:/x/b100-am-ui', 'b100-am-ui') === 'present', 'a drive-letter path declares its last segment');
check(declarationOf('TENANCY: /srv/repos/plugin-eslint', 'plugin-eslint') === 'present', 'a rooted path declares');
check(declarationOf('TENANCY: ~/repos/plugin-eslint', 'plugin-eslint') === 'present', 'a home-relative path declares');
check(declarationOf('TENANCY: .claude/worktrees/agent-x', 'agent-x') === 'present', 'a relative path under `worktrees` declares');
check(declarationOf(`TENANCY: .claude${BACK}worktrees${BACK}agent-x`, 'agent-x') === 'present', 'the same with backslashes');
check(declarationOf('TENANCY: repos/plugin-eslint', 'plugin-eslint') === 'unnamed', 'any other relative path is prose and declares nothing');
check(declarationOf('TENANCY: rama feat/agent-x', 'agent-x') === 'unnamed', 'a branch in a Spanish brief is prose too: the shape decides, not the word before it');
check(declarationOf('TENANCY: e2e-uc C:', 'e2e-uc') === 'present', 'a bare drive is not a path, so the bare words still declare');
check(declarationOf('TENANCY: e2e-uc 9:/x', 'e2e-uc') === 'present', 'a digit before `:/` is no drive letter, so it is not a path');
check(declarationOf('TENANCY: e2e-uc worktrees', 'e2e-uc') === 'present', 'the bare word `worktrees` is not a path');
check(declarationOf('TENANCY: e2e-uc x/worktrees-old/y', 'e2e-uc') === 'present', 'a segment merely starting with `worktrees` is not one');
check(declarationOf('TENANCY: C:/x/agent-aaa', BACKSLASH_PATH) === 'present', 'a checkout given with backslashes is matched by its last segment');
check(declarationOf('TENANCY: b100-am-ui', 'B100-AM-UI') === 'present', 'a checkout given in upper case is matched');
check(
  declarationOf(`TENANCY: never chain; you work in ${WORKTREES}/e2e-uc`, 'chain') === 'unnamed',
  'on a line holding a path, a bare name does not declare even BEFORE the path'
);
check(
  declarationOf('TENANCY: plugin-eslint — junction into C:/x/node_modules', 'plugin-eslint') === 'unnamed',
  'THE STATED BOUND: a bare name beside an absolute path does not declare — write the checkout\'s own path'
);
check(declarationOf('TENANCY: e2e-uc; never chain', 'chain') === 'present', 'THE STATED BOUND: a path-free line credits every bare name on it');

// ── 5. THE SHAPES THE OTHER CONSUMERS ALREADY RELY ON ──────────────────────────────────────────────

// The form the brief-tenancy refusal itself suggests: `TENANCY: <name> — …`, then prose that may hold a path.
check(declarationOf(`TENANCY: ${PLUGIN_ESLINT} — node_modules is a junction into b100-am-ui.`, PLUGIN_ESLINT) === 'present', 'declared by full path, then prose');
check(declarationOf('TENANCY: plugin-eslint — junction into b100-am-ui, measured with Get-Item -Force.', PLUGIN_ESLINT) === 'present', 'declared by last segment, then prose');
check(
  declarationOf('TENANCY: plugin-eslint — node_modules is a junction into b100-am-ui/node_modules (Get-Item -Force).', PLUGIN_ESLINT) === 'present',
  'the incident replay: a relative junction target is prose, so the bare name still declares'
);
check(
  declarationOf('TENANCY: plugin-eslint — junction farm into main/node_modules.', PLUGIN_ESLINT) === 'present',
  'the constructed-machine replay: the same, with a path closed by a period'
);
check(
  declarationOf('TENANCY: plugin-eslint — node_modules is a junction into b100-am-ui/node_modules (Get-Item -Force).', 'b100-am-ui') === 'unnamed',
  'a junction TARGET named inside a path is prose, not a declaration'
);
check(
  declarationOf(`TENANCY: plugin-eslint — junction.\nTENANCY: plugin-stylelint — the same junction.`, `${PROJECTS}/plugin-stylelint`) === 'present',
  'one TENANCY line per checkout: the second line declares the second checkout'
);
check(
  declarationOf(`TENANCY: b100-am-ui — you work ONLY inside the worktree \`${BACKSLASH_PATH}\`, on its branch.`, 'agent-aaa') === 'present',
  'the takeover brief of agent-liveness declares its worktree'
);
check(
  declarationOf(`TENANCY: b100-am-ui — you work ONLY inside the worktree \`${BACKSLASH_PATH.replace('agent-aaa', 'agent-bbb')}\`, on its branch.`, 'agent-aaa') === 'unnamed',
  'a takeover brief naming a different worktree does not declare this one'
);
check(declarationOf('TENANCY: b100-am-ui — its own tree.', PLUGIN_ESLINT) === 'unnamed', 'a line declaring a different checkout is `unnamed`');
check(declarationOf('TENANCY: plugin-eslint — junction.\r\nmore', PLUGIN_ESLINT) === 'present', 'CRLF lines are read');
check(declarationOf('TENANCY: plugin-eslint\r\nmore', PLUGIN_ESLINT) === 'present', 'a name that ends a CRLF line declares: the CR is not part of it');
check(declarationOf('- TENANCY: plugin-eslint — junction into b100-am-ui.', PLUGIN_ESLINT) === 'present', 'a markdown bullet is a declaration');
check(declarationOf('TENANCY (measured 2026-10-18): plugin-eslint', PLUGIN_ESLINT) === 'present', 'a qualifier between the word and the colon is the author\'s, and only the text after the colon declares');
check(declarationOf('TENANCY (plugin-eslint): b100-am-ui', PLUGIN_ESLINT) === 'unnamed', 'a name inside the qualifier does not declare');

// ── 6. THE FIVE STATES ARE UNCHANGED ───────────────────────────────────────────────────────────────

check(declarationOf('As the TENANCY: line below shows, this is a junction.', PLUGIN_ESLINT) === 'buried', 'a marker inside a sentence is `buried`');
check(declarationOf('per the TENANCY: plugin-eslint note, it is shared.', PLUGIN_ESLINT) === 'buried', 'a buried marker naming the checkout is still `buried`');
check(declarationOf('TENANCY plugin-eslint is junctioned', PLUGIN_ESLINT) === 'no-colon', 'a heading marker without a colon is `no-colon`');
check(declarationOf('TENANCYWISE: plugin-eslint is fine', PLUGIN_ESLINT) === 'buried', '`TENANCYWISE:` is not the marker');
check(declarationOf('Nothing relevant here.', PLUGIN_ESLINT) === 'absent', 'no marker at all is `absent`');
check(declarationOf('TENANCY plugin-eslint\nTENANCY: b100-am-ui', PLUGIN_ESLINT) === 'unnamed', 'a colon-bearing line makes the state `unnamed`, even after a colon-free one');

// ── 7. THE EXPORTED PARTS ──────────────────────────────────────────────────────────────────────────

check(checkoutName(`${PROJECTS}/plugin-eslint/`) === 'plugin-eslint', 'checkoutName ignores a trailing slash');
check(checkoutName('/') === '/', 'checkoutName of a path with no segment is the path itself');
check(JSON.stringify(tenancyLines('TENANCY: a\n  * TENANCY: b\nTENANCYWISE: c\nx TENANCY: d')) === JSON.stringify([': a', ': b']), 'tenancyLines returns the text after each heading marker');

console.log(`${assertions - failures}/${assertions} assertions passed @es ${assertions - failures}/${assertions} aserciones correctas`);
process.exit(failures === 0 ? 0 : 1);

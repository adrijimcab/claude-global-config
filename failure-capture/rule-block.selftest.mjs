#!/usr/bin/env node
/**
 * Discrimination proof of moving a promoted rule's text between rules files (`rule-block.mjs`): where a block
 * begins and ends, what a move plans and refuses, and the PROOF that the block arrived whole and nothing else
 * moved, including when the write LIES.
 *
 * @es Prueba de discriminación de mover el texto de una regla promovida entre ficheros de reglas
 * (`rule-block.mjs`): dónde empieza y termina un bloque, qué planea y qué rechaza un movimiento, y la PRUEBA
 * de que el bloque llegó entero y nada más se movió, también cuando la escritura MIENTE.
 */

import { commitBlockRoute, findBlock, planBlockRoute, provesBlockRoute } from './rule-block.mjs';

const HEADER = '---\npaths:\n  - "x"\n---\n# Area rules\n';
const BLOCK = ['- **`moving-key`** — the rule, in prose with a ñ and 日本.', '  RULE: first sentence.', '  - **sub-bullet** kept with its block.', '  RULE: last sentence.'];
const OTHER = ['- **`staying-key`** — another rule.', '  RULE: stays put.'];
const SOURCE = ['# Promoted', '', 'A preamble line.', '', ...OTHER, '', ...BLOCK, '', '- **`last-key`** — the last rule.', ''].join('\n');

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 700)}`));

// --- where a block is
{
  const found = findBlock(SOURCE, 'moving-key');

  check('a block opens at its key line and ends at the first blank line, sub-bullets included', found.lines?.join('\n') === BLOCK.join('\n'), JSON.stringify(found));
  check('the last block of a file that ends with no blank line ends at the end of the file', findBlock('- **`only-key`** — x.\n  RULE: y.', 'only-key').lines?.length === 2);
  check('a key that is nowhere has no block, count 0', findBlock(SOURCE, 'absent-key').count === 0);
  check('a key that opens two blocks is ambiguous, count 2', findBlock(`${SOURCE}\n${BLOCK.join('\n')}\n`, 'moving-key').count === 2);
  check('a key quoted mid-line does not open a block', findBlock('A line mentioning - **`moving-key`** in prose.\n', 'moving-key').count === 0);
  check('a key that is the prefix of another key does not open the other\'s block', findBlock('- **`moving-key-two`** — x.\n', 'moving-key').count === 0);
  check('CRLF text is read the same', findBlock(SOURCE.split('\n').join('\r\n'), 'moving-key').lines?.length === BLOCK.length);
}

// --- the plan
const plan = planBlockRoute({ from: SOURCE, to: undefined, key: 'moving-key', header: HEADER });

check('the plan moves the block: the source loses it and one blank line, and nothing else', plan.ok && plan.from === ['# Promoted', '', 'A preamble line.', '', ...OTHER, '', '- **`last-key`** — the last rule.', ''].join('\n'), JSON.stringify(plan.from));
check('...a new destination is the header, a blank line, the block, a final newline', plan.to === `${HEADER}\n${BLOCK.join('\n')}\n`, JSON.stringify(plan.to));

{
  const existing = `${HEADER}\n- **\`old-key\`** — an old rule.\n`;
  const next = planBlockRoute({ from: SOURCE, to: existing, key: 'moving-key', header: HEADER });

  check('an existing destination keeps what it held, and the block follows one blank line after it', next.to === `${existing}\n${BLOCK.join('\n')}\n`, JSON.stringify(next.to));
}

{
  const crlf = planBlockRoute({ from: SOURCE.split('\n').join('\r\n'), to: undefined, key: 'moving-key', header: HEADER });

  check('CRLF source: the block keeps its \\r and the new destination is CRLF throughout', crlf.ok && crlf.to.split('\n').filter((line) => line !== '').every((line) => line.endsWith('\r')) && crlf.to.includes(BLOCK[0] + '\r\n'), JSON.stringify(crlf.to));
}

{
  const first = planBlockRoute({ from: `${BLOCK.join('\n')}\n\n${OTHER.join('\n')}\n`, to: undefined, key: 'moving-key', header: HEADER });
  const last = planBlockRoute({ from: `${OTHER.join('\n')}\n\n${BLOCK.join('\n')}\n`, to: undefined, key: 'moving-key', header: HEADER });

  check('a block at the start or at the end of the source leaves no stray blank line', first.from === `${OTHER.join('\n')}\n` && last.from === `${OTHER.join('\n')}\n`, JSON.stringify([first.from, last.from]));
}

check('a block already in the destination and gone from the source is nothing to do, ok', planBlockRoute({ from: '# Promoted\n', to: `${HEADER}\n${BLOCK.join('\n')}\n`, key: 'moving-key', header: HEADER }).block?.length === 0);

for (const [name, input] of [
  ['a key the source does not hold', { from: '# Promoted\n', to: undefined }],
  ['a key the source holds twice', { from: `${SOURCE}\n${BLOCK.join('\n')}\n`, to: undefined }],
  ['a key both files hold', { from: SOURCE, to: `${HEADER}\n${BLOCK.join('\n')}\n` }],
]) {
  const refused = planBlockRoute({ ...input, key: 'moving-key', header: HEADER });

  check(`the plan REFUSES ${name}, bilingual`, !refused.ok && refused.problems.every((problem) => problem.includes(' @es ')), JSON.stringify(refused));
}

// --- the proof
const before = { from: SOURCE, to: undefined };
const after = { from: plan.from, to: plan.to };
const proves = (patch) => provesBlockRoute({ before, after: { ...after, ...patch }, block: plan.block, key: 'moving-key', header: HEADER });
const named = (result, fragment) => !result.ok && result.deficits.some((deficit) => deficit.includes(fragment) && deficit.includes(' @es '));

check('the proof holds for the planned move', proves({}).ok, JSON.stringify(proves({})));
check('a block that arrived with a line altered is not the block', named(proves({ to: plan.to.replace('first sentence', 'first sentences') }), 'not in the destination'));
check('a block that arrived with a line missing is not the block', named(proves({ to: plan.to.replace('  RULE: last sentence.\n', '') }), 'not in the destination'));
check('a block that did not arrive is caught', named(proves({ to: HEADER }), 'not in the destination'));
check('something else written to the destination besides the block is caught', named(proves({ to: `${plan.to}\nA stray line.\n` }), 'something else'));
check('something the destination had that is lost is caught', named(provesBlockRoute({ before: { from: SOURCE, to: `${HEADER}\n- **\`old-key\`** — old.\n` }, after: { from: plan.from, to: `${HEADER}\n${BLOCK.join('\n')}\n` }, block: plan.block, key: 'moving-key', header: HEADER }), 'something else'));
check('a block still in the source is caught', named(proves({ from: SOURCE }), 'still in the source'));
check('a source that changed by more than the block is caught', named(proves({ from: plan.from.replace('A preamble line.', 'A changed preamble.') }), 'more than the block'));
check('a source that lost another rule is caught', named(proves({ from: plan.from.replace(OTHER.join('\n'), '') }), 'more than the block'));

// --- the commit
function memory(initial) {
  const state = { ...initial, writes: [] };

  return {
    state,
    io: {
      writeFrom: (text) => { state.from = text; state.writes.push('from'); },
      writeTo: (text) => { state.to = text; state.writes.push('to'); },
      readBack: () => ({ from: state.from, to: state.to })
    }
  };
}

{
  const world = memory(before);
  const proof = commitBlockRoute({ before, plan, io: world.io });

  check('commit with honest writes: proved, the destination written first', proof.ok && world.state.writes.join() === 'to,from' && world.state.from === plan.from && world.state.to === plan.to, JSON.stringify(world.state));
}

{
  const world = memory(before);
  let lied = false;
  const liar = { ...world.io, writeTo: (text) => { world.state.to = lied ? text : text.replace('first sentence', 'first sentences'); lied = true; } };
  const proof = commitBlockRoute({ before, plan, io: liar });

  check('a destination that comes back altered is not proved: the proof reads the re-read file, not the plan', !proof.ok, JSON.stringify(proof));
  check('...and BOTH files are restored, a destination that did not exist back to NOT existing', world.state.from === SOURCE && world.state.to === undefined, JSON.stringify(world.state));
}

console.log(`rule-block selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);

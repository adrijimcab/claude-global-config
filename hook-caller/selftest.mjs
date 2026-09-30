#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `identify-caller.mjs`: each signal alone, both, neither, the near misses
 * (an empty `agent_id`, `subagents` as part of a longer segment), both path separators, and the two
 * recorded payloads in `../hook-payloads/` whose caller is known.
 * @es PRUEBA DE DISCRIMINACIÓN de `identify-caller.mjs`: cada señal sola, ambas, ninguna, los
 * casi-aciertos (`agent_id` vacío, `subagents` dentro de un segmento más largo), ambos separadores de
 * ruta, y las dos grabaciones de `../hook-payloads/` cuyo llamante se conoce.
 */

import { recordedPayload } from '../hook-payloads/payloads.mjs';
import { isSubagentCaller } from './identify-caller.mjs';

const SUBAGENT_TRANSCRIPT = 'C:\\Users\\u\\.claude\\projects\\C--repo\\s1\\subagents\\agent-a123.jsonl';
const MAIN_TRANSCRIPT = 'C:\\Users\\u\\.claude\\projects\\C--repo\\s1.jsonl';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

check('agent_id alone marks a subagent', isSubagentCaller({ agent_id: 'a123' }), true);
check('a subagents transcript directory alone marks a subagent', isSubagentCaller({ transcript_path: SUBAGENT_TRANSCRIPT }), true);
check('both signals mark a subagent', isSubagentCaller({ agent_id: 'a123', transcript_path: SUBAGENT_TRANSCRIPT }), true);
check('neither signal is the main session', isSubagentCaller({ transcript_path: MAIN_TRANSCRIPT }), false);
check('an empty agent_id does not count', isSubagentCaller({ agent_id: '', transcript_path: MAIN_TRANSCRIPT }), false);
check('a non-string agent_id does not count', isSubagentCaller({ agent_id: 7 }), false);
check('a non-object payload is never a subagent', isSubagentCaller(null), false);
check('forward slashes are read too', isSubagentCaller({ transcript_path: '/home/u/.claude/projects/r/s1/subagents/agent-a1.jsonl' }), true);
check('"subagents" inside a longer segment is the main session', isSubagentCaller({ transcript_path: 'C:\\Users\\u\\.claude\\projects\\C--x-subagents-archive\\s1.jsonl' }), false);
check('the recorded mem_save payload (agent_id, main transcript path) is a subagent', isSubagentCaller(recordedPayload('mcp__plugin_engram_engram__mem_save').payload), true);
check('the recorded Agent payload (neither signal) is the main session', isSubagentCaller(recordedPayload('Agent').payload), false);

if (failures.length > 0) {
  console.error(`hook-caller selftest: ${failures.length} FAILURE(S) of ${passed + failures.length}`);

  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`hook-caller selftest: ${passed}/${passed} passed`);

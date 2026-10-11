#!/usr/bin/env node
/**
 * Mutant campaign of the stale-session warning: each mutant reverts ONE decision and
 * `prompt-hook.selftest.mjs` must go red. Uses the fleet's shared runner (read only); a missing runner exits 2
 * (NOT MEASURED), never a verdict.
 * @es Campaña de mutantes del aviso de sesión desactualizada: cada mutante revierte UNA decisión y el selftest
 * debe ponerse en rojo. Sin runner compartido sale con 2 (NO MEDIDO), nunca un veredicto.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const EXIT_NOT_MEASURED = 2;

const G = 'stale-session-guard';

const MUTANTS = [
  // decide.mjs
  ['a group the session already had counts as lacked', `${G}/decide.mjs`, 'filter((group) => !known.has(group.key))', 'filter((group) => known.has(group.key))'],
  ['a restart is not detected', `${G}/decide.mjs`, 'storedMarker !== currentMarker', 'storedMarker === currentMarker'],
  ['an unknown stored marker counts as a restart', `${G}/decide.mjs`, "typeof storedMarker === 'string' && typeof currentMarker", "typeof currentMarker"],
  ['an unknown current marker counts as a restart', `${G}/decide.mjs`, "&& typeof currentMarker === 'string' &&", '&&'],
  ['an empty lack is warned', `${G}/decide.mjs`, 'lacked.length > 0 && lackFingerprint', 'lackFingerprint'],
  ['a lack already warned is warned again', `${G}/decide.mjs`, 'lackFingerprint(lacked) !== warnedFingerprint', 'lackFingerprint(lacked) === warnedFingerprint'],
  ['a lack is warned whatever was warned before', `${G}/decide.mjs`, 'lackFingerprint(lacked) !== warnedFingerprint', 'true'],

  // hook-groups.mjs
  ['the matcher is not part of the group identity', `${G}/hook-groups.mjs`, 'JSON.stringify([event, matcher ?? \'\', command])', 'JSON.stringify([event, command])'],
  ['the event is not part of the group identity', `${G}/hook-groups.mjs`, 'JSON.stringify([event, matcher ?? \'\', command])', 'JSON.stringify([matcher ?? \'\', command])'],
  ['an absent settings file is an empty configuration', `${G}/hook-groups.mjs`, 'if (file === SETTINGS_FILES[0]) return undefined;', ''],
  ['an unreadable settings file is an empty configuration', `${G}/hook-groups.mjs`, '  } catch {\n    return undefined;\n  }\n\n  return groups;', '  } catch {\n    return groups;\n  }\n\n  return groups;'],
  ['the local settings are not read', `${G}/hook-groups.mjs`, "['settings.json', 'settings.local.json']", "['settings.json']"],
  ['the notice shows the relative climb of a guard path', `${G}/hook-groups.mjs`, ".map((guard) => guard.split('../').join(''))", '.map((guard) => guard)'],
  ['a manifest that cannot be read breaks the group', `${G}/hook-groups.mjs`, '  } catch {\n    return [];\n  }\n}', '  } catch {\n    throw new Error("manifest");\n  }\n}'],

  // process-start-marker.mjs
  ['a compaction counts as a process restart', `${G}/process-start-marker.mjs`, "'SessionStart:resume', 'SessionStart:clear'", "'SessionStart:resume', 'SessionStart:clear', 'SessionStart:compact'"],
  ['the oldest start is the marker', `${G}/process-start-marker.mjs`, 'stamps.at(-1)', 'stamps.at(0)'],
  ['a resume is not a restart', `${G}/process-start-marker.mjs`, "'SessionStart:startup', 'SessionStart:resume', 'SessionStart:clear'", "'SessionStart:startup', 'SessionStart:clear'"],

  // session-record.mjs
  ['the record is never persisted', `${G}/session-record.mjs`, '  renameSync(temporary, file);', ''],
  ['an unreadable record is thrown', `${G}/session-record.mjs`, '  } catch {\n    return undefined;\n  }\n}\n\n/**\n * Writes', '  } catch {\n    throw new Error("record");\n  }\n}\n\n/**\n * Writes'],

  // prompt-hook.mjs
  ['subagent callers are judged', `${G}/prompt-hook.mjs`, 'isSubagentCaller(payload) || ', ''],
  ['a session id that climbs out of the state directory is recorded', `${G}/prompt-hook.mjs`, " || !isRecordableSession(sessionId)", ''],
  ['the baseline is not retaken on restart', `${G}/prompt-hook.mjs`, 'record === undefined || processRestarted(record.marker, marker)', 'record === undefined'],
  ['the lack warned is never remembered', `${G}/prompt-hook.mjs`, 'warnedFor: lackFingerprint(lacked) }', 'warnedFor: null }'],
  ['the baseline is the empty set', `${G}/prompt-hook.mjs`, 'baseline: [...current.keys()]', 'baseline: []'],
  ['the notice is delivered for the wrong event', `${G}/prompt-hook.mjs`, "hookEventName: 'UserPromptSubmit'", "hookEventName: 'PreToolUse'"],
  ['the notice blocks the prompt', `${G}/prompt-hook.mjs`, "    additionalContext: speaker.line(", "    decision: 'block',\n    additionalContext: speaker.line("],
  ['a failure of its own blocks the prompt', `${G}/prompt-hook.mjs`, '  } catch {\n    return undefined;\n  }\n}\n\nif', '  } catch {\n    return { decision: "block" };\n  }\n}\n\nif'],
  ['the BOM is not stripped', `${G}/prompt-hook.mjs`, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the CLI does not print the notice', `${G}/prompt-hook.mjs`, 'if (output !== undefined) process.stdout.write(JSON.stringify(output));', ''],
  ['the CLI does not run as the main process', `${G}/prompt-hook.mjs`, 'if (process.argv[1] !== undefined && path.resolve', 'if (false && path.resolve'],

  // messages.mjs
  ['the notice drops the Spanish half', `${G}/messages.mjs`, "es: 'SESIÓN DESACTUALIZADA:", "es: 'STALE SESSION:"]
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(EXIT_NOT_MEASURED);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: [G, 'hook-state', 'bilingual-output', 'hook-caller'],
  selftest: `${G}/prompt-hook.selftest.mjs`,
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 120_000
});

process.exit(survivors === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * The decisions of the agent lifecycle (`active-owner.mjs`, `lifecycle-log.mjs`, `recorder.mjs`), each broken
 * once, that `selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`;
 * `crashKills: 'fail'` makes a mutant that only crashes the selftest count as a survivor.
 *
 * @es Las decisiones del ciclo de vida de agentes, rotas una a una, que `selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const A = 'agent-liveness/active-owner.mjs';
const L = 'agent-liveness/lifecycle-log.mjs';
const R = 'agent-liveness/recorder.mjs';

const MUTANTS = [
  // --- the decision order ---
  ['a recorded stop does not stop', A, "if (recorded?.event === STOP) continue;", ''],
  ['a stop sends the agent to the window rule', A, "if (recorded?.event === STOP) continue;", "if (recorded?.event === STOP) { unrecorded.push(record); continue; }"],
  ['a start with no stop is not trusted', A, 'const owner = startedOwner(path, record, recorded.at, now);', 'const owner = undefined;'],
  ['nothing recorded is not asked the window rule', A, 'if (recorded === undefined || now - recorded.at >= STARTED_CEILING_MS) {', 'if (false) {'],
  ['the window rule is asked about every record, stopped ones included', A, 'return quietOwner(path, unrecorded, now);', 'return quietOwner(path, records, now);'],
  ['the window rule is not asked at all', A, 'return quietOwner(path, unrecorded, now);', 'return undefined;'],
  ['the last event does not win', L, 'last.set(key, { event: record.event, at });', 'if (!last.has(key)) last.set(key, { event: record.event, at });'],

  // --- the crash ceiling ---
  ['a start is trusted forever', A, 'now - recorded.at >= STARTED_CEILING_MS', 'false'],
  ['a start is never trusted past a minute', A, 'now - recorded.at >= STARTED_CEILING_MS', 'now - recorded.at >= 60 * 1000'],
  ['a start at the ceiling is still trusted', A, 'now - recorded.at >= STARTED_CEILING_MS', 'now - recorded.at > STARTED_CEILING_MS'],

  // --- joining a started agent to a worktree ---
  ['a started agent owns every worktree', A, 'return record.worktree.toLowerCase() === wanted ?', 'return true ?'],
  ['the worktree name is compared with case', A, 'return record.worktree.toLowerCase() === wanted ?', 'return record.worktree === wanted ?'],
  ['a started agent without a worktree of its own is joined without its brief', A, 'if (mtime === undefined) return undefined;\n\n  return quietOwner(path, [record], mtime) === undefined ? undefined :', 'if (mtime === undefined) return undefined;\n\n  return false ? undefined :'],
  ['a started taker with no transcript is joined', A, 'if (mtime === undefined) return undefined;', 'if (mtime === undefined) return { id: record.id, quietForMs: 0 };'],
  ['the brief is asked with the real clock (a quiet taker is lost)', A, 'quietOwner(path, [record], mtime)', 'quietOwner(path, [record], now)'],
  ['an empty worktree name matches', A, "if (wanted === '') return undefined;", ''],
  ['the quiet time ignores the start', A, 'Math.max(startedAt, mtime ?? 0)', 'mtime ?? 0'],
  ['the quiet time ignores the writes', A, 'Math.max(startedAt, mtime ?? 0)', 'startedAt'],
  ['the quiet time is counted to the wrong end', A, '{ id: record.id, quietForMs: now - lastSign } : undefined;', '{ id: record.id, quietForMs: lastSign - now } : undefined;'],

  // --- the keys ---
  ['the harness prefix is not stripped', L, 'const bare = id.startsWith(FILE_PREFIX) ? id.slice(FILE_PREFIX.length) : id;', 'const bare = id;'],
  ['an id is matched by containment', L, 'return bare === \'\' ? undefined : bare;', "return bare === '' ? undefined : bare.slice(0, 2);"],
  ['the bare prefix is an id', L, "return bare === '' ? undefined : bare;", 'return bare;'],
  ['a non-string id is an id', L, "if (typeof id !== 'string') return undefined;", ''],

  // --- reading the store ---
  ['an unknown event is kept', L, "(record.event !== START && record.event !== STOP)", 'false'],
  ['a line with a bad time is kept', L, '|| Number.isNaN(at)', ''],
  ['a line with no agent is kept', L, 'if (key === undefined ||', 'if (false ||'],
  ['a corrupt file throws', L, "    return lifecycleFrom(readFileSync(lifecyclePath(), 'utf8'));\n  } catch {\n    return new Map();", "    return lifecycleFrom(readFileSync(lifecyclePath(), 'utf8'));\n  } catch (error) {\n    throw error;"],
  ['a corrupt line ends the reading', L, '  } catch {\n    return undefined;\n  }\n}\n\n/**\n * What is recorded', '  } catch (error) {\n    throw error;\n  }\n}\n\n/**\n * What is recorded'],
  ['the start event is spelled differently from the one read', R, "SubagentStart: START", "SubagentStart: STOP"],
  ['the stop event is spelled differently from the one read', R, "SubagentStop: STOP", "SubagentStop: START"],

  // --- the recorder ---
  ['an event that is not a start or a stop is recorded', R, "if (event === undefined) return undefined;", "if (event === undefined) return { event: START, agent_id: payload?.agent_id, time: now.toISOString() };"],
  ['a payload with no agent id is recorded as a start', R, "if (agentId === undefined) return { event: 'malfunction'", "if (agentId === undefined) return { event, agent_id: 'unknown', time: now.toISOString() }; if (false) return { event: 'malfunction'"],
  ['the recorded time is not the event time', R, 'time: now.toISOString(),\n    cwd:', 'time: new Date(0).toISOString(),\n    cwd:'],
  ['the cwd is not recorded', R, 'cwd: textOf(payload.cwd),', ''],
  ['the agent transcript is not recorded', R, 'transcript: textOf(payload.agent_transcript_path),', ''],
  ['the payload keys are not recorded', R, 'keys: Object.keys(payload).sort()\n  };', 'keys: []\n  };'],
  ['a BOM is not stripped', R, 'raw.charCodeAt(0) === 0xfe_ff ? raw.slice(1) : raw', 'raw'],
  ['garbage is not recorded', R, "    record({ event: 'malfunction', time: now.toISOString(), why: error instanceof Error", "    void ({ event: 'malfunction', time: now.toISOString(), why: error instanceof Error"],
  ['a write failure throws out of the recorder', R, "  } catch {\n    /* recording is best effort", "  } catch (error) {\n    throw error; /* recording is best effort"],
  ['the recorder blocks', R, '  return undefined;\n}\n\nfunction run()', "  return { decision: 'block', reason: 'recorded' };\n}\n\nfunction run()"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['agent-liveness', 'hook-dispatch', 'hook-state', 'brief-tenancy', 'bilingual-output'],
  selftest: 'agent-liveness/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);

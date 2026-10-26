#!/usr/bin/env node
/**
 * The decisions of the live judge rates and of the Wilson interval, each broken once, that `rates.selftest.mjs` must
 * catch by assertion (`crashKills: 'fail'`). The runner is `../mutation-proof/run-mutants.mjs`; it mutates a COPY.
 *
 * @es Las decisiones de las tasas en vivo de los jueces y del intervalo de Wilson, rotas una a una, que
 * `rates.selftest.mjs` debe cazar por aserción.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const WILSON = 'judge-gate/wilson.mjs';
const RATES = 'judge-gate/rates.mjs';

const MUTANTS = [
  // --- THE INTERVAL.
  ['the quantile is the 90% one', WILSON, 'Z95 = 1.959963984540054', 'Z95 = 1.6448536269514722'],
  ['the centre loses its continuity term', WILSON, 'const centre = rate + z2 / (2 * n);', 'const centre = rate;'],
  ['the spread loses its small-sample term', WILSON, ' + z2 / (4 * n * n)', ''],
  ['the interval is not rescaled', WILSON, 'const scale = 1 + z2 / n;', 'const scale = 1;'],
  ['the low end may fall below zero', WILSON, 'low: Math.max(0, (centre - spread) / scale)', 'low: (centre - spread) / scale'],
  ['the high end may pass one', WILSON, 'high: Math.min(1, (centre + spread) / scale)', 'high: (centre + spread) / scale'],
  ['no cases is a measurement', WILSON, '!Number.isInteger(n) || n <= 0 || ', ''],
  ['k above n is a measurement', WILSON, ' || k > n', ''],
  ['a negative k is a measurement', WILSON, ' || k < 0', ''],
  ['a fractional k is a measurement', WILSON, ' || !Number.isInteger(k)', ''],
  ['the rate is printed with no decimal', WILSON, '(100 * share).toFixed(1)', '(100 * share).toFixed(0)'],
  ['no cases reads as a rate', WILSON, "if (interval === undefined) return { en: `${k}/${n} (not measured)`", "if (false) return { en: `${k}/${n} (not measured)`"],
  ['the Spanish half says measured', WILSON, 'es: `${k}/${n} (no medido)`', 'es: `${k}/${n} (medido)`'],

  // --- WHAT COUNTS.
  ['a continued stop enters the rate', RATES, "const first = mine.filter((record) => record.continued !== true);", 'const first = mine;'],
  ['a fallback block is a model verdict', RATES, "VERDICTS.includes(record.outcome) && record.cause === undefined);", 'VERDICTS.includes(record.outcome));'],
  ['a shadow block is not a block', RATES, "record.outcome === 'block' || record.outcome === 'shadow-block';", "record.outcome === 'block';"],
  ['a non-verdict enters the rate as a pass', RATES, "Object.freeze(['pass', 'block', 'shadow-block'])", "Object.freeze(['pass', 'block', 'shadow-block', 'non-verdict'])"],
  ['a shadow block is not judged', RATES, "Object.freeze(['pass', 'block', 'shadow-block'])", "Object.freeze(['pass', 'block'])"],
  ['another judge is counted', RATES, 'record.judge === judge && (sinceMs', '(sinceMs'],
  ['the window is ignored', RATES, '(sinceMs === undefined || Date.parse(record.ts) >= sinceMs)', 'true'],
  ['the window start is exclusive', RATES, 'Date.parse(record.ts) >= sinceMs', 'Date.parse(record.ts) > sinceMs'],
  ['a fallback non-verdict is not counted', RATES, " || record.cause === 'non-verdict'", ''],
  ['a fallback block is not counted apart', RATES, "record.outcome === 'block' && record.cause !== undefined).length", "false).length"],
  ['the capped stops are not counted', RATES, "record.outcome === 'pass-continued-capped').length", "false).length"],
  ['the median includes the free stops', RATES, 'const asked = mine.filter((record) => record.durationMs > 0);', 'const asked = mine;'],
  ['the median is the lower middle', RATES, 'sorted[Math.floor(sorted.length / 2)]', 'sorted[Math.floor((sorted.length - 1) / 2)]'],
  ['the median is not sorted', RATES, 'const sorted = [...values].sort((left, right) => left - right);', 'const sorted = [...values];'],
  ['a non-finite cost poisons the sum', RATES, '(Number.isFinite(record.costUsd) ? record.costUsd : 0)', 'record.costUsd'],
  ['a torn line is not counted', RATES, '    } catch {\n      torn += 1;', '    } catch {\n      void torn;'],
  ['a non-object line is a record', RATES, "!Array.isArray(record)) records.push(record);\n      else torn += 1;", "!Array.isArray(record)) records.push(record);"],
  ['a blank line is torn', RATES, "    if (line.trim() === '') continue;\n", ''],

  // --- THE COMMAND LINE.
  ['a missing log is a zero', RATES, '    return EXIT_NOT_MEASURED;\n  }\n\n  const { records', '    text = \'\';\n  }\n\n  const { records'],
  ['an unknown judge is accepted', RATES, 'if (judge !== undefined && !JUDGE_NAMES.includes(judge)) throw', 'if (false) throw'],
  ['a bad date is accepted', RATES, "if (since !== undefined && !Number.isFinite(Date.parse(since))) throw", 'if (false) throw'],
  ['an option with no value is accepted', RATES, "  if (value === undefined || value.startsWith('--')) throw", '  if (false) throw'],
  ['--judge is ignored', RATES, 'judges = judge === undefined ? JUDGE_NAMES : [judge];', 'judges = JUDGE_NAMES;'],
  ['--log is ignored', RATES, "file = option(argv, '--log') ?? outcomesPath();", 'file = outcomesPath();'],
  ['the not-measured exit is 1', RATES, 'const EXIT_NOT_MEASURED = 2;', 'const EXIT_NOT_MEASURED = 1;'],
  ['the missing log loses its Spanish half', RATES, ' @es NO MEDIDO: no se puede leer el registro', ' NO MEDIDO: no se puede leer el registro'],
  ['importing the CLI runs it', RATES, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['judge-gate', 'voice-judge', 'premise-judge', 'pending-judge', 'backlog-guard', 'backlog-owner-guard', 'hook-state', 'hook-dispatch', 'bilingual-output', 'settings.json'],
  selftest: 'judge-gate/rates.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);

/**
 * Las invocaciones de `gentle-ai sync` que un script ejecuta, y si cada una es solo una vista previa.
 *
 * El subcomando es el primer argumento que no empieza con `-` (el uso es `gentle-ai <comando>
 * [flags]`), así que `gentle-ai sync-status` o `gentle-ai skill-registry` no son un sync. Una
 * invocación es `dryRun` solo con `--dry-run` o `--dry-run=true`: `--dry-run=false` sincroniza de
 * verdad, y se trata como tal.
 */
import { executedPrograms } from './executed-programs.mjs';

const PROGRAM = 'gentle-ai';
const SUBCOMMAND = 'sync';
const DRY_RUN_SPELLINGS = new Set(['--dry-run', '--dry-run=true']);

/** @returns {{ args: string[], dryRun: boolean }[]} */
export const syncInvocations = (script, dialect) =>
  executedPrograms(script, dialect)
    .filter(({ program, args }) => program === PROGRAM && args.find((arg) => !arg.startsWith('-')) === SUBCOMMAND)
    .map(({ args }) => ({ args, dryRun: args.some((arg) => DRY_RUN_SPELLINGS.has(arg)) }));

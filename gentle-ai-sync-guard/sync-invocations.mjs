/**
 * The `gentle-ai sync` invocations a script runs, and whether each is only a preview.
 *
 * The subcommand is the first leading non-flag word, so `gentle-ai sync-status` is not a sync; a help
 * flag (`--help`, `-h`) before the subcommand, or the word `help`, asks for help and is never a sync
 * (see subcommand-words.mjs). An invocation is `dryRun` only with `--dry-run` or `--dry-run=true`;
 * `--dry-run=false` really syncs and is treated as such.
 *
 * @es Las invocaciones de `gentle-ai sync` que un script ejecuta, y si cada una es solo una vista previa.
 * El subcomando es la primera palabra inicial que no es un flag, así que `gentle-ai sync-status` o
 * `gentle-ai skill-registry` no son un sync; y un flag de ayuda (`--help`, `-h`) ANTES del subcomando, o
 * la palabra `help`, piden ayuda, no un sync (ver subcommand-words.mjs). Una invocación es `dryRun` solo
 * con `--dry-run` o `--dry-run=true`: `--dry-run=false` sincroniza de verdad, y se trata como tal.
 */
import { executedPrograms } from './executed-programs.mjs';
import { subcommandWords } from './subcommand-words.mjs';

const PROGRAM = 'gentle-ai';
const SUBCOMMAND = 'sync';
const DRY_RUN_SPELLINGS = new Set(['--dry-run', '--dry-run=true']);

/** Whether `gentle-ai sync` run with `args` only previews. @es Si `gentle-ai sync` con `args` solo hace una vista previa. */
export const isDryRun = (args) => args.some((arg) => DRY_RUN_SPELLINGS.has(arg));

/** @returns {{ args: string[], dryRun: boolean }[]} */
export const syncInvocations = (script, dialect) =>
  executedPrograms(script, dialect)
    .filter(({ program, args }) => program === PROGRAM && subcommandWords(args)[0] === SUBCOMMAND)
    .map(({ args }) => ({ args, dryRun: isDryRun(args) }));

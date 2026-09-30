/**
 * The package-manager MUTATIONS a piece of PROSE mentions.
 *
 * WHY THIS IS NOT A TOKEN LIST. The set of commands that can destroy this machine's shared tree is
 * already owned, measured and maintained by `toolchain-guard/package-manager-mutations.mjs` — down to
 * npm's misspelled aliases (`isntall`) and the `npm run ci:lint` boundary that keeps the daily command
 * out of it. A second list here would be correct on the day it was written and wrong the day that one
 * changes, which is the defect this repository has a standing rule about. So this module owns exactly
 * one question — WHICH PIECES OF A BRIEF COULD BE READ AS A COMMAND LINE — and hands each of them to
 * the module that owns what a command line does.
 *
 * WHAT A CANDIDATE IS: every line, and every short suffix of a line. A shell reads the FIRST word of a
 * line as the command, so the real corpus sentence "their pipelines now use npm install instead"
 * parses as the command `their` and yields nothing. Offering each word position as a fresh start hands
 * the parser the one reading in which `npm` is a command, without this module ever knowing that `npm`
 * is a manager. Backticks need no handling of their own, and that is measured rather than assumed: the
 * shell parser reads a backtick as command substitution, so `Run \`npm ci\` in the author's repo`,
 * `don't run \`npm ci\` here` and a span inside a quoted question were all found by the suffixes alone.
 * An earlier draft extracted backtick spans separately; the mutation proof showed that removing it
 * changed no decision, and code no proof can distinguish from its absence is not kept.
 *
 * THE DIRECTORY IS DISCARDED HERE, deliberately. `packageManagerMutations` answers where a mutation
 * LANDS, which is the right question for a shell call and the wrong one for prose: a brief's command
 * has no working directory, only the one a reader would give it. Where the hazard lives is decided by
 * `decision.mjs` from the checkouts the brief NAMES, never from a cwd invented here.
 *
 * FAILS OPEN per candidate: a prose line is not a shell line, and a parser throwing on one is evidence
 * about the line, never about the brief.
 *
 * @es Las MUTACIONES de gestor de paquetes que menciona una PROSA. No hay lista de tokens: el conjunto
 * de comandos peligrosos ya lo posee, medido, `toolchain-guard/package-manager-mutations.mjs`. Este
 * módulo posee una sola pregunta: QUÉ TROZOS DE UN BRIEF PUEDEN LEERSE COMO LÍNEA DE COMANDO — cada
 * línea y cada sufijo corto de línea, porque un shell toma la PRIMERA palabra como comando. Las comillas
 * invertidas no necesitan trato propio, y está medido: el parser las lee como sustitución de comando y
 * los sufijos bastan. El DIRECTORIO se descarta: la prosa no tiene directorio de trabajo. Falla ABIERTO
 * por candidato.
 */

import { DIALECTS } from '../shell-command/shell-command.mjs';
import { packageManagerMutations } from '../toolchain-guard/package-manager-mutations.mjs';

/** The fence that opens and closes a code block; the fence line itself is not a command. @es La valla. */
const FENCE = '```';

/**
 * A directory that exists nowhere, so a mutation's landing place can never be mistaken for a real one.
 * Handing the parser `process.cwd()` would report a fact about the hook as a fact about the brief.
 * @es Un directorio que no existe: pasar `process.cwd()` contaría un hecho del hook como del brief.
 */
const NOWHERE = 'C:/brief-tenancy-prose-has-no-working-directory';

/**
 * How many words of a suffix are offered to the parser.
 *
 * A mutation is decided by its first two words — the manager and the verb — and those two are all this
 * module keeps. Six leaves room for `npm audit fix` and a flag or two without turning a 1000-word brief
 * into 1000 parses of a 1000-word string. A verb further than six words from its manager is not a
 * command anybody wrote.
 * @es Cuántas palabras de un sufijo se ofrecen al parser. Una mutación la deciden sus dos primeras
 * palabras; seis dejan sitio a `npm audit fix` sin disparar el coste.
 */
const SUFFIX_WORDS = 6;

/**
 * Every non-blank line of `text`, and every short suffix of each line.
 * @es Cada línea no vacía de `text` y cada sufijo corto de cada línea.
 */
export function commandCandidates(text) {
  const candidates = new Set();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('\r').join('').trim();

    if (line.length === 0 || line.startsWith(FENCE)) continue;

    candidates.add(line);

    const words = line.split(' ').filter((word) => word.length > 0);

    for (let start = 1; start < words.length; start += 1) candidates.add(words.slice(start, start + SUFFIX_WORDS).join(' '));
  }

  return [...candidates];
}

/**
 * The distinct `manager verb` pairs `text` mentions, as the toolchain guard's own table names them.
 *
 * @param text The brief, resume or message body, exactly as the tool received it.
 * @returns `['npm ci', 'npm install']` — sorted, distinct, empty when the prose mentions no mutation.
 * @es Los pares `gestor verbo` distintos que menciona `text`, nombrados por la tabla del toolchain guard.
 */
export function mentionedMutations(text) {
  const found = new Set();

  for (const candidate of commandCandidates(text)) {
    // BOTH dialects, because a brief quotes the shell its reader will use and this machine runs two.
    for (const dialect of [DIALECTS.BASH, DIALECTS.POWERSHELL]) {
      try {
        for (const mutation of packageManagerMutations(candidate, dialect, NOWHERE)) found.add(`${mutation.manager} ${mutation.verb}`);
      } catch {
        /* a prose line is not a shell line; a parser throwing on one says nothing about the brief */
      }
    }
  }

  return [...found].sort();
}

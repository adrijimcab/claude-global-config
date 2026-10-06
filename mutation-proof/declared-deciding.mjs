/**
 * The modules of `~/.claude` that decide and that NO structural rule of `deciding-modules.mjs` can see: not
 * dispatched by a manifest, not a hook entry that emits a verdict, not named for it. Each carries the reason, so
 * the owner can read why a campaign is demanded and drop the entry when the module stops deciding.
 *
 * This list stays short on purpose: a module that can be found by structure must not be listed here. It is a
 * list of what is DEMANDED, never of exceptions: a module missing from it is demanded nothing, and one that
 * moves or disappears is a PROBLEM of the scope check, not a silent drop.
 *
 * @es Los módulos de `~/.claude` que deciden y que NINGUNA regla estructural de `deciding-modules.mjs` ve: ni
 * despachados por un manifiesto, ni entradas de hook que emiten veredicto, ni nombrados así. Cada uno lleva su
 * motivo. La lista es corta a propósito y es de lo EXIGIDO, nunca de excepciones: lo que falta no se exige, y lo
 * que se mueve o desaparece es un PROBLEMA del chequeo, no un descarte silencioso.
 */

export const DECLARED_DECIDING = Object.freeze([
  Object.freeze({ file: 'worktree-landing/land.mjs', why: 'lands a verified branch on the shared branch, or refuses: the landing verdict' }),
  Object.freeze({ file: 'worktree-landing/preconditions.mjs', why: 'decides whether a landing may start, or throws the refusal that names why not' }),
  Object.freeze({ file: 'hook-dispatch/merge.mjs', why: 'merges the verdicts of several guards into the one the harness reads: deny beats ask beats allow' })
]);

/**
 * The DECISION: does this brief send a worker at a package-manager mutation, inside a checkout this
 * machine has MEASURED as belonging to another tree, without ever saying so?
 *
 * ── THE INCIDENT, AND THE QUESTION THIS DELIBERATELY DOES NOT ASK ──────────────────────────────────
 * A delegation brief said: "Inside the two PLUGIN repositories, which have their own independent trees,
 * `npm ci` is exactly the command you are trying to make work, so run it there freely." The premise was
 * false — `plugin-eslint` and `plugin-stylelint` both carry a `node_modules` that is a JUNCTION into
 * `b100-am-ui/node_modules`, measured by `Get-Item -Force` and again by `tenancyOf` — and the sentence
 * lifted this machine's hardest prohibition on the strength of it.
 *
 * The obvious guard is "refuse a brief that AUTHORIZES a prohibited command". It cannot be built, and
 * that is a measurement rather than an opinion. Over the 334 real briefs and resumes in
 * `.claude/brief-provenance-study/`, 24 mention a package-manager mutation and every one, read by hand,
 * is legitimate: 12 are the prohibition itself (`NEVER run \`npm install\``, the correct sentence, 11 of
 * them in the standard brief preamble), 10 are documentary (`so \`npm ci\` exits EUSAGE there`), and 2
 * authorise a sanctioned command (`npm install --package-lock-only`). The hazardous sentence and the
 * correct warning contain the IDENTICAL command span; they differ only in the polarity of the prose
 * around it. `discriminator-study.mjs` runs each candidate over that corpus and reports the cost:
 * refusing on the token alone refuses 24 of 334 real delegations and catches none of them, and the
 * fairest negation-polarity reading still refuses 10 — every documentary mention, because a sentence
 * that DESCRIBES a command negates nothing. A control that reddens on correct briefs is switched off
 * within the hour, which is a worse end state than the hazard.
 *
 * ── SO THE QUESTION IS CHANGED, TO ONE THE MACHINE CAN ANSWER ──────────────────────────────────────
 * Not "is this permission or prohibition?" — unanswerable — but "is this brief working near a tree the
 * machine knows is somebody else's, and does it SAY SO?". Tenancy is not prose: `tree-tenancy.mjs`
 * measures it from the filesystem, and it is exactly the premise the incident got wrong. Measured over
 * the same 334 texts, the conjunction — a mutation mentioned AND a foreign-tenanted checkout named —
 * fires on ZERO of them, while the incident brief satisfies both halves. It is not a proxy for intent;
 * it refuses a brief that has nowhere to state the one fact that would have made the claim testable.
 *
 * ── WHAT THE REFUSAL BUYS, which is the whole mechanism ────────────────────────────────────────────
 * The refusal PRINTS THE MEASUREMENT: `plugin-eslint → node_modules is a junction into b100-am-ui`. The
 * author reads that before writing the declaration line that clears it. A false premise about tenancy
 * cannot survive being shown its own refutation at the moment it is being written — which is the
 * difference between this and a contract paragraph saying the same thing.
 *
 * ── THE RESIDUAL GAP, STATED RATHER THAN DISCOVERED ────────────────────────────────────────────────
 * A brief that names its repository only in words ("the two PLUGIN repositories") and never by absolute
 * path is invisible to `named-checkouts.mjs`, and this decision allows it. Closing that would mean
 * resolving prose names to directories — guessing — and the guess would redden correct briefs. The
 * damage of the unnamed case is still prevented, by the `toolchain-guard` on Bash, which refuses the
 * command itself: measured on the incident's own commands, `cd <plugin repo> && npm ci` → deny,
 * `npm run ci:lint` → allow, the in-container `sh -c "npm ci"` → allow. This guard closes the half that
 * one cannot see — the brief — and never the half it already holds.
 *
 * ── THE MEASURED FALSE POSITIVE, STATED RATHER THAN HIDDEN ─────────────────────────────────────────
 * A CORRECT brief that names a live agent worktree and forbids a mutation in it — "NEVER run
 * `npm install` in C:/…/.claude/worktrees/agent-x" — is refused (measured: 107 ms, deny). That is not a
 * misfire of the decision: an agent worktree is a 1208-link junction farm owned by the main checkout, and
 * `npm install` there is precisely the 2026-09-17 destruction. But the brief was right, and it must add
 * one `TENANCY:` line to pass. The corpus under-represents this state — 1 of 334 texts names a worktree
 * path, with no mutation beside it — because worktree paths are ephemeral and most briefs say "your
 * worktree". It is the cost this design carries, and the one to watch in `state/refusals.jsonl`.
 *
 * FAILS OPEN on everything it cannot read: an unknown tenancy, an unreadable directory, a throw. A guard
 * able to wedge delegation is a larger hazard than the one it closes.
 *
 * @es LA DECISIÓN: ¿manda este brief a un trabajador a una mutación de gestor de paquetes dentro de un
 * checkout que esta máquina ha MEDIDO como de otro árbol, sin decirlo? El guard obvio —«rechaza el brief
 * que AUTORIZA»— no se puede construir, y eso es una medición: sobre 334 briefs y resumes reales, 24
 * mencionan una mutación y las 24 son legítimas (12 son la prohibición misma, 10 son descriptivas, 2
 * autorizan un comando sancionado); leer la polaridad aún rechaza 10. FALSO POSITIVO MEDIDO: un brief
 * correcto que prohíbe `npm install` en un worktree nombrado por ruta se rechaza hasta añadir una línea. La frase peligrosa y la advertencia correcta contienen el MISMO
 * comando y solo difieren en la polaridad de la prosa. Así que se cambia la pregunta por una que la
 * máquina sí contesta: ¿trabaja este brief junto a un árbol ajeno, y LO DICE? La tenencia no es prosa,
 * se mide. La conjunción dispara en CERO de los 334 textos reales y sí en el brief del incidente. El
 * rechazo IMPRIME LA MEDICIÓN, que es el mecanismo entero: una premisa falsa sobre tenencia no sobrevive
 * a que le enseñen su refutación mientras se escribe. HUECO RESIDUAL DICHO: un brief que nombre el
 * repositorio solo con palabras es invisible aquí y se permite; ese daño lo sigue impidiendo el
 * toolchain guard sobre Bash. FALLA ABIERTO ante todo lo que no puede leer.
 */

import { TENANCY, filesystemProbe, tenancyOf } from '../toolchain-guard/tree-tenancy.mjs';
import { mentionedMutations } from './mentioned-mutations.mjs';
import { namedCheckouts } from './named-checkouts.mjs';
import { TENANCY_WORD, checkoutName, declarationOf } from './tenancy-declaration.mjs';

/** The tenancy states in which a checkout's tree belongs to another one. @es Estados de árbol ajeno. */
const FOREIGN = new Set([TENANCY.FARM, TENANCY.LINKED]);

/** How a foreign tree is shaped, in the words `toolchain-guard` uses for it. @es La forma del árbol ajeno. */
const shapeOf = (tenancy) =>
  tenancy.state === TENANCY.LINKED
    ? 'node_modules is ITSELF a junction into another tree'
    : `node_modules is a real directory, but ${tenancy.links} of its ${tenancy.total} entries are junctions`;

/**
 * The foreign-tenanted checkouts `text` names, each with its measurement and how the brief declares it.
 * @es Los checkouts de árbol ajeno que nombra `text`, con su medición y cómo los declara el brief.
 */
function undeclaredForeignCheckouts(text, probe) {
  const found = [];

  for (const checkout of namedCheckouts(text)) {
    const tenancy = tenancyOf(checkout, probe);

    // UNKNOWN and ABSENT are not evidence of a hazard. A directory the filesystem would not describe is
    // a fact about this moment, never about the brief, and it must never become a refusal.
    if (!FOREIGN.has(tenancy.state)) continue;

    const declaration = declarationOf(text, checkout);

    if (declaration === 'present') continue;

    found.push({ checkout, tenancy, declaration });
  }

  return found;
}

/**
 * The refusal for a brief, or `undefined` when it may proceed.
 *
 * The work is ordered by cost, and that ordering is load-bearing rather than tidy: classifying one
 * junction farm resolves 1208 links on this machine, so tenancy is measured only once the cheap
 * question — does this brief mention a mutation at all? — has already said yes. The same ordering, and
 * the same reason, as `toolchain-guard/install-guard.mjs`.
 *
 * @param text The brief, resume or message body, exactly as the tool received it.
 * @param probe Injectable filesystem view, handed to {@link tenancyOf}; defaults to the real one.
 * @returns `{ mutations, checkouts }` or `undefined`.
 * @es El rechazo de un brief, o `undefined`. El trabajo va ordenado por coste, y el orden es
 * determinante: clasificar un farm resuelve 1208 enlaces, así que la tenencia se mide solo cuando la
 * pregunta barata ya ha dicho que sí.
 */
export function refusalFor(text, probe = filesystemProbe) {
  if (typeof text !== 'string' || text.trim().length === 0) return undefined;

  const mutations = mentionedMutations(text);

  if (mutations.length === 0) return undefined;

  const checkouts = undeclaredForeignCheckouts(text, probe);

  if (checkouts.length === 0) return undefined;

  return { mutations, checkouts };
}

/** One line per checkout, naming the state its declaration is in and the edit that fixes it. @es Una línea por checkout. */
function diagnose({ checkout, tenancy, declaration }) {
  const name = checkoutName(checkout);
  const measured = [
    `  ${checkout}`,
    `    its tree  : ${shapeOf(tenancy)}`,
    `    lands in  : ${tenancy.target}`,
    `    owned by  : ${tenancy.owner}`
  ];

  if (declaration === 'unnamed')
    return [
      ...measured,
      `    NEAR MISS — this brief has a ${TENANCY_WORD} line, but it does not name ${name}.`,
      '    A declaration is bound to the checkout it declares, so a template line cannot pre-satisfy it',
      `    for a repository nobody had thought of yet. Name this one: ${TENANCY_WORD}: ${name} — …`
    ];

  if (declaration === 'no-colon')
    return [
      ...measured,
      `    NEAR MISS — ${TENANCY_WORD} does start a line, but that line carries no colon.`,
      `    Add one, and name the checkout: ${TENANCY_WORD}: ${name} — …`
    ];

  if (declaration === 'buried')
    return [
      ...measured,
      `    NEAR MISS — ${TENANCY_WORD} appears in the brief, but not at the START of a line.`,
      `    A marker is a HEADING, not a word inside a sentence: ${TENANCY_WORD}: ${name} — …`
    ];

  return [...measured, `    UNDECLARED — this brief carries no ${TENANCY_WORD} line naming ${name}.`];
}

/**
 * The refusal text. It states what was MEASURED before it states what is required, because the
 * measurement is the part that does the work: an author about to write "they have their own independent
 * trees" is reading the junction that refutes it.
 * @es El texto del rechazo. Dice lo MEDIDO antes de lo exigido, porque la medición es lo que actúa.
 */
export function reason({ mutations, checkouts }, surface, toolName) {
  const first = checkoutName(checkouts[0].checkout);

  return [
    `BRIEF-TENANCY REFUSED this ${surface} (${toolName}): it puts a package-manager mutation and a tree`,
    'this machine owns from somewhere else in the same brief, and never says which is which.',
    '',
    `MENTIONED IN THIS BRIEF: ${mutations.map((mutation) => `\`${mutation}\``).join(', ')}`,
    '',
    'MEASURED JUST NOW, from the filesystem, for every checkout this brief names by absolute path:',
    '',
    ...checkouts.flatMap((checkout) => [...diagnose(checkout), '']),
    'WHAT THIS GUARD IS NOT DOING. It has not decided that your brief authorises anything. It cannot:',
    'measured over 334 real briefs and resumes, the sentence that authorises and the sentence that',
    'forbids carry the identical command span and differ only in the prose around it, so refusing on',
    'that reading would refuse 24 of 334 correct delegations — 11 of them the standard preamble\'s own',
    '`NEVER run `npm install``. It is refusing a brief that has nowhere to state the one fact the',
    'reader needs, which is the fact printed above.',
    '',
    'WHY THAT FACT. A brief once said "the two PLUGIN repositories, which have their own independent',
    'trees" and sent a worker to run `npm ci` there. Both repositories\' node_modules are junctions into',
    'b100-am-ui\'s, so the command would have deleted the tree the whole fleet was building on. The claim',
    'took one command to check and was never checked.',
    '',
    'ADD ONE LINE, naming the checkout and what you measured about it:',
    '',
    `  ${TENANCY_WORD}: ${first} — node_modules is a junction into ${checkoutName(checkouts[0].tenancy.owner.split('\\').join('/'))}; nothing is installed there.`,
    '',
    `The line must START with ${TENANCY_WORD}, carry a colon, and NAME the checkout — the full path or`,
    'its last segment. What sits between the word and the colon is yours. It is bound to the checkout on',
    'purpose: a declaration that could be written once in a template would satisfy every future brief,',
    'including the one that gets this wrong, and a control that cannot say no is not a control.',
    '',
    'If the tenancy printed above surprises you, that is this refusal working. Re-read your own sentence',
    'about these repositories before you write the line.'
  ].join('\n');
}

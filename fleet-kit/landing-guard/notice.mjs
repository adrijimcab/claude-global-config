/**
 * The words a person reads when the landing guard speaks: what would move, why it is ungraded, and the
 * one road that makes it gradable.
 * @es Las palabras que lee una persona cuando la guarda habla: qué se movería, por qué no está
 * calificado, y el camino que lo hace calificable.
 */

const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 10) : '<none>');

const GATE_RUN = 'node "$HOME/.claude/fleet-kit/gate-run/gate-run.mjs" --worktree <a clean checkout of that commit>';

function findingLines({ finding, governed, invocation }) {
  const head = `  - ${finding.branch} in ${governed.repository.mainCheckout}  (\`${invocation.text.trim()}\`)`;

  if (finding.kind === 'unknowable') return [head, `      unknowable before it happens: ${finding.why}`];

  return [head, `      ${short(finding.from)} -> ${short(finding.to)}, tree ${short(finding.tree)}`, `      ${finding.why}`];
}

/** The notice for every finding of one shell line. @es El aviso para todos los hallazgos de una línea. */
export function landingNotice(findings) {
  return [
    'LANDING GUARD (fleet-kit): this line would move an integration branch to content no complete, green',
    'run of the repository\'s declared unit suite has graded.',
    '',
    ...findings.flatMap(findingLines),
    '',
    'DO INSTEAD: build the change on its own branch, grade that exact tree, then fast-forward:',
    `  ${GATE_RUN}`,
    '  git merge --ff-only <branch>   (or push that same commit)',
    'A verdict is keyed by TREE, so the fast-forward to the graded commit passes silently.'
  ].join('\n');
}

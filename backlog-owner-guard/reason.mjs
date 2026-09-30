/**
 * Bilingual refusal text for one `decide()` verdict. English first, then the `@es` Spanish mirror in the
 * SAME message, per this project's standing bilingual-runtime-text rule.
 * @es Texto de rechazo bilingüe para un veredicto de `decide()`. Inglés primero, espejo `@es` en el
 * mismo mensaje, según la regla vigente de texto de ejecución bilingüe.
 */
export function reason(refusal) {
  const diagnosis = {
    'save-master-topic-key': `You called \`${refusal.toolName}\` with \`topic_key: "${refusal.topicKey}"\` — that is the project's MASTER backlog record.`,
    'retarget-into-master-topic-key': `You called \`${refusal.toolName}\` with a new \`topic_key: "${refusal.topicKey}"\` — that would turn this observation INTO the project's master backlog record.`,
    'targets-master-observation': `You called \`${refusal.toolName}\` on observation id ${refusal.id}, which is currently the project's master backlog record (\`topic_key: "${refusal.topicKey}"\`).`,
    'unresolvable-id': `You called \`${refusal.toolName}\` on observation id ${JSON.stringify(refusal.id)}, and this guard could NOT confirm that id is safe (${refusal.detail}). It fails CLOSED: an id it cannot verify is treated as the master backlog until proven otherwise.`
  }[refusal.kind];

  return [
    'BACKLOG-OWNER GUARD refused this call: a delegated subagent may never write, update, or delete',
    "the project's master backlog.",
    '',
    diagnosis,
    '',
    'Owner ruling (2026-09-30, after a subagent overwrote the master backlog citing the owner-mandate',
    'file that describes it): the backlog belongs to the ORCHESTRATOR only. Put your finding in your',
    'SubagentHandback report instead — the orchestrator reads the CURRENT master backlog, adds your',
    'finding to the full text, and writes it back in the same turn.',
    '',
    '@es GUARDIA DE PROPIEDAD DEL BACKLOG: rechazó esta llamada. Un subagente delegado nunca escribe,',
    'actualiza ni borra el backlog maestro del proyecto. El backlog es solo del ORQUESTADOR. Pon tu',
    'hallazgo en tu informe de SubagentHandback — el orquestador lee el backlog maestro ACTUAL, añade',
    'tu hallazgo al texto completo, y lo reescribe en el mismo turno.'
  ].join('\n');
}

/**
 * Bilingual refusal text for one `decide()` verdict: English first, then the `@es` Spanish half in the
 * same message, per the owner's bilingual-runtime-text rule.
 * @es Texto de rechazo bilingüe para un veredicto de `decide()`: inglés primero y la mitad en español
 * marcada con `@es` en el mismo mensaje, según la regla del dueño de texto de ejecución bilingüe.
 */

/** The first line of every refusal, fixed so a proof can find it inside a merged dispatcher reason. @es La primera línea de todo rechazo, fija para que una prueba la encuentre dentro de una razón fusionada. */
export const REFUSAL_HEADLINE = 'WORKER-DELEGATION GUARD refused this call: a delegated worker may never start agents of its own.';

export function reason(refusal) {
  return [
    REFUSAL_HEADLINE,
    '',
    `You are subagent \`${refusal.agentId}\`, and you called \`${refusal.toolName}\`. Only the orchestrator`,
    'delegates: it holds the concurrency cap (at most 3 heavy workers at once), and a worker that splits',
    'its errand among agents of its own exceeds that cap without anyone deciding it.',
    '',
    'Do the work yourself with your own tools. If it genuinely needs more workers, stop and say so in your',
    'SubagentHandback report — what to split, and why — and the orchestrator decides.',
    '',
    '@es GUARDIA DE DELEGACIÓN DE WORKERS: rechazó esta llamada. Un worker delegado nunca lanza agentes',
    'propios. Solo el orquestador delega: él controla el tope de concurrencia (como máximo 3 workers',
    'pesados a la vez), y un worker que reparte su encargo entre agentes propios supera ese tope sin que',
    'nadie lo decida. Haz el trabajo tú con tus propias herramientas. Si de verdad necesita más workers,',
    'detente y dilo en tu informe de SubagentHandback — qué repartir y por qué — y el orquestador decide.'
  ].join('\n');
}

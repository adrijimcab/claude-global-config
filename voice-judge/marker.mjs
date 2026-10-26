/**
 * The marker every voice-judge block reason starts with, shared by every rubric of `rubrics/` and re-exported by
 * `prompt.mjs`, so the journal guard reads the blocks of whichever rubric is live.
 * @es La marca con que empieza todo motivo de bloqueo del juez de voz, compartida por cada rúbrica de `rubrics/` y
 * reexportada por `prompt.mjs`, para que la guardia de journal lea los bloqueos de la rúbrica que esté viva.
 */
export const MARKER = 'VOICE-JUDGE:';

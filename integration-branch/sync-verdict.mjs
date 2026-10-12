/**
 * Owns the decision of the origin/HEAD sync: given the branch the project declares, where origin/HEAD points
 * now and whether the remote-tracking ref of the declared branch exists in this clone, is the clone
 * `in-sync`, does it need a `set` (the ref exists, so `git remote set-head` can point at it), or is it
 * `missing-remote-ref` (nothing may be pointed at a ref that does not exist, and the tool never invents one).
 *
 * @es Es dueño de la decisión de la sincronización de origin/HEAD: dada la rama que declara el proyecto, a
 * dónde apunta origin/HEAD ahora y si existe en este clon la referencia de seguimiento de la rama declarada,
 * el clon está `in-sync`, necesita un `set` (la referencia existe, así que `git remote set-head` puede
 * apuntar a ella) o tiene `missing-remote-ref` (nada se apunta a una referencia inexistente y la herramienta
 * nunca inventa una).
 */

/**
 * @param {{ want: string, current: string | undefined, remoteRefExists: boolean }} inputs
 * @returns {'in-sync' | 'set' | 'missing-remote-ref'}
 */
export function syncVerdict({ want, current, remoteRefExists }) {
  if (current === want) return 'in-sync';
  return remoteRefExists ? 'set' : 'missing-remote-ref';
}

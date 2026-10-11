/**
 * Owns the question "may this tool publish to this remote?". Only the owner's own backup repositories
 * (`github.com/adrijimcab/*`) are pushed by a landing, under his standing rule that config backups go up in
 * the same turn. EVERY other remote (company hosts, anything unknown, a remote whose URL cannot be read) is
 * never pushed: the owner pushes it himself or authorizes it in chat. There is deliberately no flag, option
 * or environment variable that turns publication on for a non-owner remote.
 *
 * The decision reads the URLs CONFIGURED for the remote (`remote.<name>.pushurl`, else `remote.<name>.url`);
 * every configured URL must be an owner URL, so one foreign push URL makes the remote foreign.
 *
 * @es Es dueño de la pregunta «¿puede esta herramienta publicar en este remoto?». Un aterrizaje solo empuja
 * a los repositorios de respaldo del propio dueño (`github.com/adrijimcab/*`), por su regla vigente de subir
 * los respaldos de config en el mismo turno. CUALQUIER otro remoto (hosts de empresa, algo desconocido, un
 * remoto cuya URL no se puede leer) no se empuja jamás: lo empuja el dueño o lo autoriza en el chat. A
 * propósito no existe bandera, opción ni variable de entorno que active la publicación en un remoto ajeno.
 * Se leen las URL CONFIGURADAS del remoto; todas deben ser del dueño, así que una sola URL de push ajena
 * hace ajeno al remoto.
 */

import { git } from './git.mjs';

/** An owner repository over https or ssh, exactly one path segment after the owner. @es Un repositorio del dueño por https o ssh. */
const OWNER_URL = /^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)adrijimcab\/[^/\s]+$/i;

/** The URLs configured under one key, or none. @es Las URL configuradas bajo una clave, o ninguna. */
function configured(main, remote, key) {
  const result = git(main, ['config', '--get-all', `remote.${remote}.${key}`]);
  return result.status === 0 ? result.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '') : [];
}

/**
 * @param {{ main: string, remote: string }} inputs
 * @returns {boolean} true only when every URL a push would use is an owner repository
 * @es Verdadero solo si todas las URL que usaría un push son repositorios del dueño.
 */
export function mayPublishTo({ main, remote }) {
  const pushUrls = configured(main, remote, 'pushurl');
  const urls = pushUrls.length > 0 ? pushUrls : configured(main, remote, 'url');
  return urls.length > 0 && urls.every((url) => OWNER_URL.test(url));
}

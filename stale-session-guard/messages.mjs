/**
 * The text of the stale-session notice, as a bilingual table rendered by `bilingual-output/`.
 * @es El texto del aviso de sesión desactualizada, como tabla bilingüe.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

export const MESSAGE_TABLE = {
  'stale-session': {
    en: 'STALE SESSION: {count} hook group(s) were registered after this session started, so these guards are NOT running here: {groups}. Restart the session (claude, or claude --resume) to load them; until then assume they do not protect this session.',
    es: 'SESIÓN DESACTUALIZADA: se registraron {count} grupo(s) de hooks después de que arrancó esta sesión, así que estas guardias NO corren acá: {groups}. Reiniciá la sesión (claude, o claude --resume) para cargarlas; hasta entonces asumí que no protegen esta sesión.'
  }
};

export const speaker = makeSpeaker(MESSAGE_TABLE);

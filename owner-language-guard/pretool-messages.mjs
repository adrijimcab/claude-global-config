/**
 * The refusal text of the PreToolUse language guard, as a bilingual table rendered by `bilingual-output/`.
 * @es El texto de rechazo del guard de idioma en PreToolUse, como tabla bilingüe.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

export const MESSAGE_TABLE = {
  'english-before-tool': {
    en: 'OWNER LANGUAGE GUARD: the line written just before this tool call is English prose addressed to the owner: "{excerpt}". Rewrite that line in Rioplatense Spanish (Gentleman tone), then call the tool again. Technical terms, code and quoted English may stay.',
    es: 'GUARD DE IDIOMA DEL DUEÑO: la línea escrita justo antes de esta llamada es prosa en inglés dirigida al dueño: «{excerpt}». Reescribí esa línea en español rioplatense (tono Gentleman) y volvé a llamar a la herramienta. Los términos técnicos, el código y las citas en inglés pueden quedar.'
  }
};

export const speaker = makeSpeaker(MESSAGE_TABLE);

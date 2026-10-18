/**
 * The words of the agent-model-guard refusals, bilingual, through `bilingual-output/`, which refuses at load a
 * message that lacks a half. Two refusals: the call names no model, and the call asks for opus for a role that
 * does not declare it. Both name the rule and the allowed values.
 *
 * @es Las palabras de los rechazos de agent-model-guard, bilingües, por `bilingual-output/`, que rechaza al
 * cargar un mensaje al que le falta una mitad. Dos rechazos: la llamada no nombra modelo, y pide opus para un
 * rol que no lo declara. Ambos nombran la regla y los valores permitidos.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'no-model': {
    en: 'AGENT-MODEL REFUSED this delegation ({tool}): the call names no `model`. Rule: rules/10-contracts.md, orchestration directive ("every Agent call names its model"). Allowed values: `haiku`, `sonnet`, and `opus` only for a role whose definition declares it ({roles}). Pick the cheapest model that does the task well.',
    es: 'AGENT-MODEL RECHAZÓ esta delegación ({tool}): la llamada no nombra `model`. Regla: rules/10-contracts.md, directiva de orquestación ("toda llamada a Agent nombra su model"). Valores permitidos: `haiku`, `sonnet`, y `opus` solo para un rol cuya definición lo declara ({roles}). Elegí el modelo más barato que haga bien la tarea.'
  },
  'opus-without-role': {
    en: 'AGENT-MODEL REFUSED this delegation ({tool}): `model: opus` was asked with {role}, and that role does not declare `model: opus` in its definition. Rule: rules/10-contracts.md, orchestration directive ("opus only for a named role whose frontmatter declares it"). Allowed values: `haiku`, `sonnet`, and `opus` only for these roles: {roles}.',
    es: 'AGENT-MODEL RECHAZÓ esta delegación ({tool}): se pidió `model: opus` con {role}, y ese rol no declara `model: opus` en su definición. Regla: rules/10-contracts.md, directiva de orquestación ("opus solo para un rol con nombre cuyo frontmatter lo declara"). Valores permitidos: `haiku`, `sonnet`, y `opus` solo para estos roles: {roles}.'
  },
  'no-roles': {
    en: 'none found',
    es: 'ninguno encontrado'
  }
};

const { line } = makeSpeaker(MESSAGE_TABLE);

/** The roles as the message lists them. @es Los roles como los lista el mensaje. */
const rolesText = (roles) => (roles.length === 0 ? line('no-roles') : roles.join(', '));

/** The refusal for a call that names no model. @es El rechazo para una llamada sin modelo. */
export function noModelReason({ toolName, roles }) {
  return line('no-model', { tool: toolName, roles: rolesText(roles) });
}

/** The refusal for opus asked of a role that does not declare it. @es El rechazo para opus pedido a un rol que no lo declara. */
export function opusReason({ toolName, role, roles }) {
  // Identifiers are not translated: the role is shown as the field the caller wrote.
  // @es Los identificadores no se traducen: el rol se muestra como el campo que escribió quien llama.
  const named = typeof role === 'string' && role.length > 0 ? `subagent_type "${role}"` : 'no subagent_type';

  return line('opus-without-role', { tool: toolName, role: named, roles: rolesText(roles) });
}

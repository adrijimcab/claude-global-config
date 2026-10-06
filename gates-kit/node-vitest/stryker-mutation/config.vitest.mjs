/**
 * Vitest config the mutation gate hands to Stryker's Vitest runner: test globals on, so the fixtures import
 * nothing from the toolchain. Nothing else is set.
 *
 * @es Config de Vitest que el gate de mutación entrega al runner de Vitest de Stryker: globals de test
 * activos, para que los fixtures no importen nada de la toolchain. No se fija nada más.
 */

export default { test: { globals: true } };

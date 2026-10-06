---
name: typescript-strict
description: >
  Strict TypeScript for application code: which tsconfig strict-family flags to enable and why,
  satisfies vs type casts, discriminated unions, branded/nominal types, exhaustive switch checks,
  readonly/immutability, and TypeScript 5.x/6.0/7.0 (native compiler) features relevant to app
  code. Trigger: writing or reviewing .ts/.tsx files, tsconfig.json/tsconfig.*.json, or designing
  a type/discriminated-union/domain model.
paths: "**/*.ts,**/*.tsx,**/tsconfig*.json"
license: MIT
metadata:
  author: b100-am-ui-research
  version: "1.0"
  typescript_range: "5.x-7.0"
  origin: "research/frontend-skills/angular-ts, drafted 2026-09-29"
---

# TypeScript estricto — reglas, flags y versión (5.x → 7.0)

Fuentes primarias: TypeScript handbook y release notes
(`github.com/microsoft/TypeScript-website`, fetched vía context7 `/microsoft/typescript-website`
2026-09-29), TypeScript 6.0 release notes (transición a TS 7.0, el compilador nativo en Go).

## 1. `tsconfig.json` — flags strict y por qué

Verificado leyendo `tsconfig.json` de `b100-am-ui` (no listado de memoria) — todos estos están
activos en ese repo:

| Flag | Qué impide | Por qué importa |
|---|---|---|
| `strict` | Paraguas: activa `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict` | Base no negociable para cualquier código nuevo |
| `strictNullChecks` | Tratar `null`/`undefined` como valores distintos de todo lo demás | Elimina la clase de bug más común en JS/TS (`Cannot read property of undefined`) |
| `noUncheckedIndexedAccess` | `arr[i]`/`obj[key]` devuelven `T`, no `T \| undefined` | Sin este flag, acceder a un índice fuera de rango tipa como si siempre existiera |
| `exactOptionalPropertyTypes` | `{x?: string}` deja de aceptar `{x: undefined}` explícito | Distingue "la clave no está" de "la clave está con valor `undefined`" — importante en DTOs de API |
| `noPropertyAccessFromIndexSignature` | Fuerza `obj['dynamicKey']` en vez de `obj.dynamicKey` sobre tipos con index signature | Hace visible en el código dónde el acceso es dinámico/no garantizado |
| `noImplicitOverride` | Exige `override` explícito al sobreescribir un miembro heredado | Evita que un rename silencioso en la clase base rompa un override sin que nadie lo note |
| `noImplicitReturns` | Toda ruta de código de una función debe retornar un valor, o ninguna | Atrapa el `if` que olvidó un `return` en una rama |
| `noFallthroughCasesInSwitch` | `case` sin `break`/`return`/`throw` | Atrapa el fallthrough accidental (el intencional se marca con comentario) |
| `useUnknownInCatchVariables` | `catch (e)` tipa `e` como `unknown`, no `any` | Fuerza a comprobar el tipo de la excepción antes de usarla |
| `noUnusedLocals` / `noUnusedParameters` | Variables/parámetros declarados y no usados | Código muerto visible en compilación, no solo en lint |
| `verbatimModuleSyntax` | Exige `import type`/`export type` explícitos para importar solo tipos | Evita que un bundler intente emitir un import que el runtime no puede resolver |

## 2. `satisfies` en vez de anotación de tipo o cast

Introducido en TypeScript 4.9 (`typescriptlang.org/docs/handbook/release-notes/typescript-4-9`).
Valida que una expresión cumple un tipo SIN cambiar el tipo inferido de esa expresión — al
contrario que una anotación (`const x: T = …`), que ensancha el tipo al declarado.

```typescript
type Colors = 'red' | 'green' | 'blue';
type RGB = [number, number, number];

// ❌ anotación: pierde la información específica de cada propiedad
const palette: Record<Colors, string | RGB> = { red: [255,0,0], green: '#0f0', blue: [0,0,255] };
palette.green.toUpperCase(); // Error: 'green' podría ser RGB

// ✅ satisfies: valida las claves/tipos, conserva el tipo específico de cada propiedad
const palette2 = {
  red: [255, 0, 0], green: '#0f0', blue: [0, 0, 255],
} satisfies Record<Colors, string | RGB>;
palette2.green.toUpperCase(); // OK: TS sabe que 'green' es string aquí
```

`satisfies` también atrapa claves de más o de menos (`Record<Colors, unknown>` con una clave
`platypus` no listada en `Colors` es error), y valida el TIPO de cada valor sin perder el tipo de
cada propiedad individual — combina lo mejor de "cast" (comprobación) y "sin anotar" (inferencia
específica).

**Regla del proyecto (AGENT-LEDGER §8, coincide)**: `as unknown as T` (double cast) es un anti-
patrón — desactiva el sistema de tipos justo donde más hace falta. `satisfies` es casi siempre la
alternativa correcta cuando lo que se quería era "valida esto contra el tipo" en vez de "confía en
mí, castea esto".

## 3. Discriminated unions y exhaustividad

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; x: number }
  | { kind: 'triangle'; x: number; y: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;
    case 'square': return s.x ** 2;
    case 'triangle': return (s.x * s.y) / 2;
    default: {
      const _exhaustive: never = s; // si se añade un 'kind' nuevo, esto deja de compilar
      return _exhaustive;
    }
  }
}
```

- El patrón `const _exhaustive: never = s` en el `default` es el check de exhaustividad estándar
  de TypeScript — si se añade un nuevo miembro a la unión y no se cubre en el `switch`, la
  asignación a `never` falla en tiempo de compilación.
  https://www.typescriptlang.org (handbook, "Narrowing" / "TS for Functional Programmers")
- Desde TypeScript 4.6, la narrowing de discriminated unions funciona también sobre variables
  DESTRUCTURADAS (`const { kind, payload } = action`) — antes de 4.6 solo funcionaba accediendo a
  `action.kind` directamente.
- En Angular, el bloque nativo `@switch`/`@case`/`@default` soporta el mismo patrón de
  exhaustividad a nivel de plantilla con `@default { never }` (ver `angular-best-practices`
  SKILL.md §3).

## 4. Tipos "branded"/nominales

TypeScript es estructural, no nominal — dos tipos con la misma forma son intercambiables aunque
representen conceptos distintos (`UserId` y `ProductId`, ambos `string`, son el mismo tipo para el
compilador). El patrón "branded type" simula nominalidad con una propiedad fantasma:

```typescript
type UserId = string & { readonly __brand: 'UserId' };
type ProductId = string & { readonly __brand: 'ProductId' };

// Único punto de entrada: un predicado que valida y estrecha, sin `as` (el `type-assertion-guard`
// global rechaza añadir aserciones de tipo).
function isUserId(id: string): id is UserId {
  return id.startsWith('u');
}

function getUser(id: UserId) { /* ... */ }

const raw = 'u1';
if (isUserId(raw)) getUser(raw); // OK: estrechado a UserId
getUser('u1');                   // Error: string no es UserId
```

Útil para IDs de distintas entidades, unidades de medida (`Meters`/`Feet`), o cualquier valor
primitivo cuya confusión sea un bug de dominio real y no solo de tipos.

## 5. `readonly` e inmutabilidad

- `readonly` en propiedades de clase/interfaz impide reasignación tras la construcción — no hace
  el VALOR inmutable (un `readonly arr: number[]` sigue permitiendo `arr.push(1)`).
  `ReadonlyArray<T>`/`readonly T[]` sí impide los métodos mutadores del array.
- Componer objetos inmutables con spread condicional en vez de casts a mutable:
  ```typescript
  // ✅ construcción inmutable
  const config = { ...base, ...(hasOverride && { override: value }) };
  // ❌ castear a mutable para "saltarse" readonly
  (config as { override?: string }).override = value;
  ```
- `as const` congela literales (`const dirs = ['n', 's'] as const` → tipo `readonly ["n", "s"]`,
  no `string[]`), útil para uniones derivadas de un array de valores permitidos.

## 6. TypeScript 5.x → 6.0 → 7.0 — qué cambia y qué le importa a código de app

Verificado vía context7 `/microsoft/typescript-website` (fetched 2026-09-29). Versiones
disponibles listadas por el índice de Context7 en el momento de esta investigación: 4.7.4, 5.8.3,
5.9.2, 5.9.3, **6.0.2**, **7.0.2**.

- **TypeScript 4.9**: operador `satisfies` (ver §2).
- **TypeScript 5.0**: decoradores estándar (stage 3, sin `experimentalDecorators`), `const` en
  parámetros de tipo genéricos (`function f<const T>(x: T)`, infiere el tipo más literal posible
  sin necesitar `as const` en cada call-site).
- **TypeScript 5.2**: `using`/`await using` (gestión determinista de recursos vía
  `Symbol.dispose`/`Symbol.asyncDispose`) — útil para cerrar conexiones/streams sin `try/finally`
  manual.
- **TypeScript 6.0** (release de TRANSICIÓN explícita hacia 7.0, no un salto de features):
  - `strict` pasa a ser `true` por DEFECTO en proyectos nuevos (si ya tenías `"strict": true` no
    cambia nada; si dependías del `false` por defecto, hay que declararlo explícito).
  - `module` por defecto pasa a `esnext` (reconoce que ESM ya es el formato dominante).
  - `target` por defecto pasa a la versión ECMAScript del año en curso (ahora mismo `es2025`) —
    deja de fijarse en una versión antigua por compatibilidad histórica.
  - `noUncheckedSideEffectImports` activo por defecto (atrapa typos en imports de solo efecto).
  - Lista de opciones DEPRECADAS que TypeScript 7.0 eliminará por completo: `target: es5`,
    `--downlevelIteration`, `--moduleResolution node`/`node10`, `module` valores
    `amd`/`umd`/`systemjs`, `--baseUrl`, `--moduleResolution classic`,
    `--esModuleInterop false`, `--alwaysStrict false`, `outFile`, sintaxis legacy de `module`
    para namespaces, keyword `asserts` en imports, directivas `no-default-lib`. Se pueden silenciar
    temporalmente con `"ignoreDeprecations": "6.0"`, pero NO sobrevivirán a 7.0 — si este repo o
    cualquier app usa alguna, migrar ahora, no esperar al bump.
- **TypeScript 7.0**: el PUERTO NATIVO del compilador (reescrito en Go, antes conocido como
  "tsc-go" / `@typescript/native-preview"). Mismo lenguaje TypeScript, compilador distinto —
  pensado por rendimiento (compilación/`--watch`/editor). Elimina las opciones deprecadas en 6.0.
  Cualquier herramienta que dependa de la API interna del compilador de TypeScript (no solo del
  CLI `tsc`) debe validarse contra los "native previews" antes de adoptar 7.0 en CI.

**Nota de versión para este repo**: `b100-am-ui` fija `typescript: ~5.8.0` — a dos releases mayores
de 6.0 y a un salto de arquitectura de 7.0. Ninguna de las opciones deprecadas en 6.0 listadas
arriba aparece en el `tsconfig.json` de este repo (verificado: no usa `target: es5`,
`moduleResolution: node`/`classic`, `outFile`, ni `esModuleInterop: false`) — el único punto de
fricción real al subir de mayor sería que `strict`/`module`/`target` ya están fijados
explícitamente en este repo (`strict: true`, `module: ESNext`, `target: ES2023`), así que los
nuevos DEFAULTS de 6.0 no cambian nada aquí; el riesgo sería en un consumidor que NO los fije
explícito.

## 7. Gate ejecutable

Ver `../angular-best-practices/references/gate-table.md` §"Reglas `@typescript-eslint` / flags de
`tsconfig.json`" — la tabla de flags de `strict` activos en este repo y su motivo vive ahí para no
duplicar la tabla en dos sitios.

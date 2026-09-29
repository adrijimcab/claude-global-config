# Signals y reactividad — detalle

Fuentes: https://angular.dev/guide/signals · https://angular.dev/api/core/linkedSignal ·
https://angular.dev/api/core/resource · https://angular.dev/api/common/http/HttpResourceFn ·
https://angular.dev/roadmap (fetched 2026-09-29) · https://angular.dev/guide/components/inputs ·
https://angular.dev/reference/migrations/outputs

## signal() / computed() / effect()

```typescript
const count = signal(0);
count.set(1);
count.update(v => v + 1);

const doubled = computed(() => count() * 2); // lazy, memoizado, deps dinámicas

constructor() {
  effect(() => {
    console.log('count is', count()); // se re-ejecuta cuando count cambia
  });
}
```

- `effect()` DEBE crearse en injection context (constructor, factory, `runInInjectionContext`).
  Nunca dentro de `afterNextRender()`/`ngOnInit()`/callbacks de observers — produce NG0203
  silencioso (ver SKILL.md §1, atribuido a `adrii-docs/skills/angular-effect-injection-context`).
- `untracked()` lee un signal sin registrar dependencia reactiva.
- Un read de signal DESPUÉS de una frontera async (un `await`, un `.then()`) pierde el tracking
  reactivo — leer el signal ANTES del await y pasar el valor, o usar `computed`/`resource`.
- `OnPush` marca automáticamente para check cuando la plantilla lee un signal que cambia.

## linkedSignal()

```typescript
function linkedSignal<D>(
  computation: () => D,
  options?: {
    equal?: ValueEqualityFn<NoInfer<D>>;
    debugName?: string;
    set?: (value: NoInfer<D>, rawSet: (value: NoInfer<D>) => void) => void;
  }
): WritableSignal<D>;
```

Signal ESCRIBIBLE cuya computación lo re-inicializa cada vez que cambian sus dependencias
reactivas — el caso de uso canónico es "selección que debe resetearse cuando cambia la lista
fuente, pero que el usuario también puede sobreescribir localmente". Sustituye el patrón
`effect()` + `set()` manual que el propio AGENT-LEDGER prohíbe (`allowSignalWrites`).

## resource() / httpResource()

- `resource()`: proyecta una `request` reactiva a una operación async (`loader`) y expone el
  resultado vía signals (`.value()`, `.status()`, `.error()`, `.isLoading()`). Cancela la carga en
  curso vía `AbortSignal` cuando el `request` cambia o el resource se destruye — **por diseño NO
  sirve para mutaciones** (una mutación en curso podría abortarse a mitad).
- `httpResource(url, options)`: especialización sobre `HttpClient` para GET con parseo JSON por
  defecto, soporta interceptores. `options.defaultValue` evita que el resultado sea `undefined`.
- Estado (fetched 2026-09-29, `angular.dev/roadmap`): resource/httpResource, linkedSignal,
  zoneless, incremental hydration, event replay y route-level render mode están en la categoría
  "Production-ready" del roadmap oficial. **Ninguno de ellos existe en Angular 19.2** (el peer de
  este repo) con ese nivel de estabilidad — confirmar la versión exacta de graduación antes de
  recomendarlos en código sobre 19.x.

## input() / model() / output()

```typescript
export class CustomSlider {
  value = input(0);                 // InputSignal<number>, valor por defecto 0
  disabled = input.required<boolean>();
  label = computed(() => `valor: ${this.value()}`);

  amount = model(0);                // two-way: [(amount)]="parentSignal"
  changed = output<number>();       // reemplaza @Output() + EventEmitter
}
```

- `output()`: introducido v17.3, **"production ready" desde v19** (verificado,
  `angular.dev/reference/migrations/outputs`). API que imita `input()` pero NO está basada en
  Signals internamente.
- El binding two-way de `model()` usa la INSTANCIA del signal (`[(value)]="volume"`), no su
  valor — error común es pasar `volume()`.
- Reglas ejecutables oficiales: `@angular-eslint/prefer-signals`,
  `@angular-eslint/prefer-signal-model`, `@angular-eslint/no-input-rename`,
  `@angular-eslint/no-output-rename`, `@angular-eslint/prefer-output-readonly`,
  `@angular-eslint/prefer-output-emitter-ref`.

## Un signal reasignable rompe la suscripción de plantilla

Si una propiedad de clase que expone un signal de ESTADO no es `readonly`, es posible
reasignarla (`this.value = signal(...)` en vez de `this.value.set(...)`) — la plantilla, que ya
capturó la referencia original, deja de reaccionar a cambios futuros del signal nuevo. Regla
ejecutable propia del proyecto: `b100/require-readonly-signals`.

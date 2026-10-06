---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/*.spec.tsx"
  - "**/*.test.tsx"
  - "**/karma.conf*"
  - "**/vitest.config*"
  - "**/vitest.workspace*"
  - "**/jest.config*"
  - "**/playwright.config*"
  - "**/src/test-setup.ts"
  - "**/src/test.ts"
---
# Frontend rules — tests

Binding when writing or reviewing frontend tests. Loaded only when a matching file is read. How a check is
proven to discriminate (state space, near misses, constructed fixtures) is in
`~/.claude/rules/promoted-guards.md`, which loads on the same files; it is not repeated here.

## 1. The runner is the project's

- Write tests for the runner the project runs (`Profile:` line: Karma+Jasmine, Jest or Vitest), with that
  runner's API: `jasmine.createSpy`/`spyOn(...).and.returnValue` under Jasmine, `vi.fn()`/`vi.spyOn` under
  Vitest, `jest.fn()` under Jest. Never mix them in one project.
- Never migrate the runner as a side effect. Karma to Vitest is its own decided change (Angular 21 schematic
  `refactor-jasmine-vitest` is experimental; Angular 22 ships the `migrate-karma-to-vitest` migration; the
  official migration guide still calls it experimental).
- Angular zoneless projects (`zoneless` in the profile) configure tests the same way; tests that relied on
  zone.js timing (`fakeAsync` around signal effects) are rewritten to `await fixture.whenStable()`, not
  re-wrapped. Angular 20 renamed `TestBed.flushEffects()` to `TestBed.tick()`; 22 removed
  `build-angular:jest` and `:web-test-runner` (detail: `angular-best-practices/versions/v<major>.md`).

## 2. What a test is for

- A test pins BEHAVIOUR through the public surface (rendered DOM via harnesses/Testing Library, a service's
  public methods, an emitted output), never private members or implementation details, so a refactor that
  keeps behaviour keeps the test green.
- Each test has one reason to fail: arrange, act, assert one behaviour; the name states the behaviour and the
  condition (`shows the empty state when the list has no items`).
- Every behaviour change ships with the test that would have failed before it: a bug fix starts with the red
  test that reproduces it.
- Cover the edges the code decides on: empty, one, many, the boundary value on each side, error and loading
  states, the denied/unauthorised path. A happy path alone proves almost nothing.
- Assertions are specific (`toEqual(expected)`, the exact text or count), never "truthy" when a value is
  known. A test with no assertion, or one that cannot fail, is a defect.

## 3. Isolation and determinism

- No real network, clock, randomness or storage: `provideHttpClientTesting()` + `HttpTestingController` (Angular),
  fake timers, an injected clock, seeded data. Verify outstanding requests (`httpTesting.verify()`).
- No order dependence and no shared mutable state between tests; fresh `TestBed`/fixtures per test.
- No sleeps or arbitrary `setTimeout` waits: wait on the condition (`whenStable`, harness waits, `findBy*`).
- Mock at the boundary you own (an injected service or port), not deep inside a library; prefer a small fake
  over a mock with ten stubbed calls.

## 4. Angular specifics

- Component tests query through component harnesses (`TestbedHarnessEnvironment`, Material/CDK harnesses),
  not `.querySelector` on internal classes; dialogs and overlays through `documentRootLoader`.
- Use the standalone setup: `TestBed.configureTestingModule({ imports: [TheComponent], providers: [...] })`;
  no `NgModule` scaffolding; `TestBed.inject()` over `TestBed.get` (the `test-bed-get` migration in 20 rewrites it).
- Set signal inputs with `fixture.componentRef.setInput('name', value)`, then let change detection run.
- `HttpClientTestingModule`/`RouterTestingModule` are deprecated since 19: `provideHttpClient()` +
  `provideHttpClientTesting()`, `provideRouter([])` + `RouterTestingHarness`.

## 5. Gates

- Coverage is a floor that only rises; it never replaces the assertions above, and no coverage exclusion or
  skipped/`.only` test is added (owner mandates: zero suppression). Diff coverage of changed lines is the
  landing check where the project has it (`~/.claude/fleet-kit/`).
- Specs are type-checked like source (`gates-kit/angular/spec-typecheck`); a spec that only compiles with
  `any` or an assertion is rewritten.
- Run the tests of the modules you changed, read the real exit code; the full suite runs once at landing.

# Testing (Testing Library philosophy, Vitest)

Source: testing-library.com/docs/react-testing-library/intro (guiding
principles, verified 2026-09-29 via search — the page is the canonical
source for this quote); Vitest is this project's own runner
(`@base100/b100-am-ui` already uses it) and is React Testing Library's
documented Jest-API-compatible alternative.

## The guiding principle

> "The more your tests resemble the way your software is used, the more
> confidence they can give you."

Consequences:

- **Query by what the user sees/hears**, not by implementation: prefer
  `getByRole`, `getByLabelText`, `getByText` over `getByTestId` or
  reaching into component internals. `getByTestId` is the last resort,
  not the default.
- **Deal in DOM nodes, not component instances.** Never assert on a
  component's internal state or call its methods directly — assert on
  what rendered.
- **A render or interaction, then an assertion on the resulting DOM/role
  state** — not a shallow-rendered tree diffed against a snapshot of
  implementation details.

## What this rules out

```tsx
// ❌ implementation detail: reaches into internals, breaks on refactor
expect(wrapper.find('SubmitButton').props().disabled).toBe(true);

// ✅ user-observable outcome
expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
```

```tsx
// ❌ tests that the effect ran, not what the user experiences
expect(mockSetState).toHaveBeenCalledWith(true);

// ✅ tests the visible result of the interaction
await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
expect(await screen.findByText(/added to cart/i)).toBeInTheDocument();
```

## Enforcement

`eslint-plugin-testing-library` gates the anti-patterns statically:
`testing-library/no-node-access` (no raw DOM traversal instead of a
query), `testing-library/no-container` (don't assert on the raw render
container), `testing-library/prefer-screen-queries`,
`testing-library/no-wait-for-multiple-assertions`.

## Async and Server/Action code

- Actions/async state: `await userEvent.click(...)` then
  `findBy*`/`waitFor` for the settled UI, not an arbitrary `setTimeout`.
- Server Components: test what they render (their output as a regular
  component in an integration test), not framework internals — a Server
  Component test is still "render, then assert on the DOM."
- Custom Hooks: `renderHook` from `@testing-library/react`, assert on the
  Hook's returned value/behavior across re-renders — not on its internal
  `useState` calls.

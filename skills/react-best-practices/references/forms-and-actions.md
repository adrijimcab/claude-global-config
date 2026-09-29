# Forms and Actions

Source: react.dev/reference/rsc/use-server (verified 2026-09-29). Keeps
and extends `adrii-docs/skills/react-19/SKILL.md`'s Actions section
(accurate); adds the constraint list and `useTransition`/`useOptimistic`
detail it omitted.

## Server Functions (`"use server"`)

Marks an **async** function as callable from client code over an
automatic network request. Not the same as a Server Component (no
directive) — see `server-client-components.md`.

```ts
// Function-level
async function addToCart(data: FormData) {
  'use server';
  // ...
}

// Module-level — every export in the file becomes a Server Function
'use server';
export async function requestUsername(formData: FormData) { /* ... */ }
```

### Constraints (quoted/summarized)

- Must be **async**; `'use server'` must be the first line of the
  function or module (comments excepted).
- Server-only file/function — cannot run in the client bundle.
- **Arguments and return values must be serializable**: primitives,
  Array, Map, Set, Date, FormData, plain objects, Promises, other Server
  Functions.
- **Treat every argument as untrusted input** — re-validate authorization
  server-side; a Server Function is a public network endpoint.
- Frameworks process one action at a time; not meant for data fetching
  (fetch data with `use()`/`React.cache`, mutate with Server Functions).

## Wiring to a form: `action=`

```tsx
async function requestUsername(formData: FormData) {
  'use server';
  const username = formData.get('username');
}

export default function App() {
  return (
    <form action={requestUsername}>
      <input type="text" name="username" />
      <button type="submit">Request</button>
    </form>
  );
}
```

Forms wrap the Server Function in a transition automatically and support
**progressive enhancement** — the form still submits before JS has
hydrated.

## Reading the result: `useActionState`

```tsx
'use client';
import { useActionState } from 'react';
import { requestUsername } from './actions';

function UsernameForm() {
  const [state, action, isPending] = useActionState(requestUsername, null);
  return (
    <form action={action}>
      <input type="text" name="username" />
      <button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Request'}</button>
    </form>
  );
}
```

`useActionState(fn, initialState)` returns `[state, wrappedAction,
isPending]` — `wrappedAction` is what you pass to `action=`, `state` is
the function's last return value (validation errors, success payload),
`isPending` drives the pending UI without a manual `useState`.

## Calling outside a form: `useTransition`

```ts
const [isPending, startTransition] = useTransition();
function onClick() {
  startTransition(async () => {
    const result = await incrementLike();
  });
}
```

## Optimistic UI: `useOptimistic`

Show the user's change immediately while the Server Function is in
flight, and let React reconcile with the real result (or roll back on
error). Use this instead of hand-rolling a local `useState` copy of
server data that you then have to keep back in sync.

## Related hooks

- `useActionState` — action result + pending state, progressive
  enhancement.
- `useTransition` — pending status for non-form Server Function calls.
- `useOptimistic` — optimistic UI pending the mutation's result.
- `useFormStatus` (react-dom) — read the parent `<form>`'s pending state
  from a child component without prop drilling (e.g. a generic
  `<SubmitButton>`).

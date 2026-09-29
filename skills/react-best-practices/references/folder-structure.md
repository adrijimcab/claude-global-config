# Folder structure

Source: no single react.dev page prescribes a folder structure (React is
unopinionated on this); this follows react.dev/learn/thinking-in-react's
component-hierarchy principle (colocate what changes together) applied to
files, plus Next.js App Router's own file-colocation convention
(nextjs.org — see the `nextjs-app-router` skill for `app/` conventions),
which is the current App Router recommendation for non-route files.

## Colocate by feature, not by file type

```
❌ type-first (spreads one feature across the whole tree)
src/
  components/UserCard.tsx
  hooks/useUser.ts
  types/user.ts
  api/user.ts

✅ feature-first (everything about "user" lives together)
src/
  features/user/
    UserCard.tsx
    useUser.ts
    user.types.ts
    user.api.ts
    index.ts        # public surface of the feature
```

- A file that only feature X uses lives inside `features/x/`, not in a
  shared top-level folder "just in case" something else needs it later.
- Promote to a shared location (`src/shared/` or `src/ui/`) only once a
  second feature actually needs it — resist speculative sharing.
- Each feature folder exports its public surface through one `index.ts`;
  internal files are not imported directly from outside the feature
  (mirrors the Server/Client boundary discipline: only what needs to be
  public is public).

## Next.js App Router specifics

Inside `app/`, colocate a route's private helpers/components in a
`_folder` (underscore-prefixed, opted out of routing) next to its
`page.tsx`, rather than a distant `components/` tree — see the
`nextjs-app-router` skill for the full file-convention table
(`layout.tsx`, `loading.tsx`, `error.tsx`, route groups, etc., verified
against nextjs.org 2026-09-29).

## Tests and stories live next to the code they cover

`UserCard.tsx`, `UserCard.test.tsx`, `UserCard.stories.tsx` in the same
folder — not a mirrored `__tests__/` tree — so moving/deleting a
component can't silently orphan its test.

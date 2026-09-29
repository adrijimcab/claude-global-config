# Component architecture

Source: react.dev/learn/thinking-in-react (verified 2026-09-29) +
react.dev/learn/reusing-logic-with-custom-hooks. Composition-pattern
detail reused and updated from
`adrii-docs/skills/vercel-composition-patterns/SKILL.md` (Vercel
Engineering, MIT) — kept as-is, it matches current React 19 guidance.

## The 5-step process (react.dev/learn/thinking-in-react)

1. **Break the UI into a component hierarchy.** "A component should
   ideally only be concerned with one thing. If it ends up growing, it
   should be decomposed into smaller subcomponents." Split along the same
   lines you'd use for CSS class selectors or design layers.
2. **Build a static version first** — props only, zero state, zero
   interactivity.
3. **Find the minimal but complete representation of state.** For each
   piece of data ask: does it stay constant over time (not state)? is it
   passed via props (not state)? can it be computed from existing
   state/props (not state, derive it)? Only what's left is state.
4. **Identify where state should live** — find every component that
   renders based on it, find their closest common parent, put the state
   there ("lifting state up").
5. **Add inverse data flow** — pass setter functions down as props so
   children can update the parent's state; this keeps data flow one-way
   and explicit.

## Container/presentational → composition (the current equivalent)

The old container/presentational split (a "smart" component owning state
wrapping a "dumb" render component) is not react.dev's current framing.
Its job — separating *what owns state* from *what renders* — is now done
by:

- **Colocating state with the component that needs it** (step 4 above),
  not hoisting everything to a top-level "container".
- **Custom Hooks** to hide *how* state/logic works behind a clear
  interface (`useOnlineStatus()`), while the component stays about *what*
  to render. Custom Hooks share logic, never the state instance itself —
  two components calling the same custom Hook get independent state.
  Name every custom Hook `use<Thing>`; this convention is required for
  `rules-of-hooks` lint checking to recognize it as a Hook.
- **Compound components + Server/Client split** for the boundary that
  used to be "container fetches, presentational renders": a Server
  Component fetches and a Client Component (passed as `children` or a
  prop) handles the interactive parts. See `server-client-components.md`.

## Avoid boolean-prop proliferation — use composition

When a component grows multiple boolean props that switch behavior
(`isCompact`, `isModal`, `hideFooter`, `showHeader`…), replace them:

```tsx
// ❌ Boolean props multiply combinatorially and get contradictory
<Card isCompact isModal hideFooter />

// ✅ Compound components: structure > flags
<Card>
  <Card.Header />
  <Card.Body compact />
  {/* no footer slot rendered at all */}
</Card>
```

```tsx
// ❌ renderX props hide the composition
<List renderItem={(item) => <Row item={item} />} />

// ✅ children — composition is visible at the call site
<List>
  {items.map((item) => <Row key={item.id} item={item} />)}
</List>
```

**Explicit variants instead of boolean modes:**

```tsx
// ❌ one component, boolean-driven modes
<Button variant="primary" outline small />

// ✅ purpose-named components/variants; each is independently testable
<PrimaryButton size="small" />
<OutlineButton size="small" />
```

## Compound components: shared context, decoupled state

```tsx
const TabsContext = createContext<{ active: string; setActive: (id: string) => void } | null>(null);

function Tabs({ defaultTab, children }: { defaultTab: string; children: React.ReactNode }) {
  const [active, setActive] = useState(defaultTab);
  return <TabsContext value={{ active, setActive }}>{children}</TabsContext>; // React 19: <Context> as provider
}

Tabs.Tab = function Tab({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = use(TabsContext); // React 19: use() instead of useContext()
  if (!ctx) throw new Error('Tab must be used within Tabs');
  return <button onClick={() => ctx.setActive(id)} aria-selected={ctx.active === id}>{children}</button>;
};
```

- **The Provider is the only place that knows *how* state is managed** —
  swap `useState` for a reducer or external store without touching
  consumers.
- Define a generic context interface — `{ state, actions, meta }` — so
  consumers depend on a stable shape, not implementation details.
- Lift state into the provider only when siblings need it; otherwise keep
  it local (see `state-management.md`).

## React 19 API changes that affect composition

- **No `forwardRef`.** `ref` is a normal prop in React 19:
  `function Input({ ref, ...props })`. Delete `forwardRef` wrappers.
- **`use(Context)` instead of `useContext(Context)`** — and unlike
  `useContext`, `use()` can be called conditionally/after an early
  return, which removes a common reason components used to over-fetch
  context at the top just to satisfy the Hooks rule.

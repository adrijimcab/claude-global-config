# State: local vs lifted vs server vs URL, and when not to use useEffect

Source: react.dev/learn/you-might-not-need-an-effect (verified
2026-09-29). All code patterns below are quoted/adapted directly from
that page.

## Decision table

| Kind of state | Where it belongs |
|---|---|
| Owned and only read by one component | `useState`/`useReducer` locally |
| Computable from props/state already in scope | Not state — compute during render; `useMemo` only if profiling shows the computation is expensive |
| Needed by siblings | Lift to the closest common parent |
| The current filter/page/tab/search query | URL (`searchParams`), so it survives refresh and is shareable/bookmarkable |
| Server-owned records (DB rows, session, auth) | Fetch server-side (Server Component / route handler); don't copy into client `useState` unless it's a user-editable optimistic copy (`useOptimistic`) |
| Reused stateful *logic* across components | Custom Hook — logic is shared, each call still has an independent state instance |

## You Might Not Need an Effect — the concrete patterns

**1. Don't transform data for rendering in an Effect.** Compute during
render:

```js
// ❌
const [fullName, setFullName] = useState('');
useEffect(() => { setFullName(firstName + ' ' + lastName); }, [firstName, lastName]);
// ✅
const fullName = firstName + ' ' + lastName;
```

**2. Cache expensive calculations with `useMemo`, not state+Effect:**

```js
// ✅
const visibleTodos = useMemo(() => getFilteredTodos(todos, filter), [todos, filter]);
```

**3. Reset all state when a prop changes → `key`, not an Effect:**

```jsx
<Profile userId={userId} key={userId} /> // remounts, state resets automatically
```

**4. Adjust *partial* state on a prop change → compute during render, or
if unavoidable, the "previous value" pattern (still runs during render,
not in an Effect):**

```js
const [prevItems, setPrevItems] = useState(items);
if (items !== prevItems) {
  setPrevItems(items);
  setSelection(null);
}
```

**5. Event-specific logic belongs in the event handler, not an Effect.**
Ask: does this run "because the component was displayed" (Effect) or
"because the user did something" (event handler)?

```js
// ❌ runs on every render where product.isInCart is true, including remounts
useEffect(() => { if (product.isInCart) showNotification(`Added ${product.name}`); }, [product]);
// ✅
function handleBuyClick() { addToCart(product); showNotification(`Added ${product.name}`); }
```

**6. Don't chain Effects that each set state and trigger the next** —
compute the whole result in one event handler instead of a
render → effect → setState → render → effect chain.

**7. Data fetching is the one case Effects are still appropriate for**,
with cleanup against race conditions:

```js
useEffect(() => {
  let ignore = false;
  fetchResults(query, page).then((json) => { if (!ignore) setResults(json); });
  return () => { ignore = true; };
}, [query, page]);
```

But prefer a framework/data layer over hand-rolled fetch-in-Effect — see
`data-fetching.md` (`use()`, `React.cache`, Next.js Server Components).
Extracting this into a custom `useData()` Hook is still valid; the Effect
itself doesn't disappear, it's just hidden behind a name that expresses
intent.

**8. Notify a parent in the event handler, not in an Effect reacting to
the child's own state:**

```js
// ✅
function updateToggle(nextIsOn) { setIsOn(nextIsOn); onChange(nextIsOn); }
```

## Quick test

If the Effect's dependency array would need to include something that
only changed *because the user did something*, the logic belongs in the
event handler. If it needs to run whenever the component is displayed
regardless of *why*, it's a legitimate Effect.

# Error boundaries and Suspense

Sources: react.dev/reference/react/Component (error boundary pattern) and
react.dev/reference/react/Suspense — both verified 2026-09-29.

## There is no built-in `<ErrorBoundary>` component

React only exposes the underlying lifecycle methods; **you write the
class**, or — per react.dev's own recommendation — **use the
`react-error-boundary` package** instead of hand-rolling one, because
"there is currently no way to write an Error Boundary as a function
component."

```tsx
class ErrorBoundary extends React.Component<Props, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logErrorToMyService(error, info.componentStack);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

```tsx
<ErrorBoundary fallback={<p>Something went wrong</p>}>
  <Profile />
</ErrorBoundary>
```

### What error boundaries do **not** catch

- Errors in **event handlers** — use try/catch or the action's own error
  state (`useActionState`'s returned `state`) instead.
- **Asynchronous code** (`setTimeout`, `requestAnimationFrame`) outside
  render.
- **SSR** errors.
- Errors **inside the boundary itself**.

Place boundaries around subtrees that can independently fail (a widget,
a route segment), not just one at the app root — one root boundary means
any unrelated error blanks the whole page.

## Suspense

`<Suspense fallback={...}>` shows the fallback until children finish
loading, then reveals them. It activates only for: `lazy()` components,
`use()` reading a promise, stylesheet loading with `precedence`, or a
framework's streaming SSR delay. **It does not detect data fetching in
`useEffect` or event handlers** — those need a manual loading `useState`.

```tsx
<Suspense fallback={<BigSpinner />}>
  <Biography />
  <Suspense fallback={<AlbumsGlimmer />}>
    <Albums /> {/* independent nested boundary: loads on its own timeline */}
  </Suspense>
</Suspense>
```

### Common pitfall: hiding content the user was already viewing

An update that suspends re-shows the nearest boundary's fallback — which
can hide content already on screen. Fix with `useTransition`/
`startTransition`: React keeps the old UI visible until the new content
is sufficiently ready, and only shows a fallback for a genuinely new
boundary.

```ts
function navigate(url: string) {
  startTransition(() => setPage(url));
}
```

React also throttles boundary reveals to at most once per 300ms, to
batch multiple ready boundaries into one smoother transition rather than
popping in one at a time.

### Resetting on navigation

`<Suspense key={userId} fallback={<Loading />}>` — changing the `key`
forces the boundary (and its children's state) to reset, showing the
fallback again for genuinely new data, the same `key`-remount pattern
used in `state-management.md` for resetting state on prop change.

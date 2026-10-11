### Receipt-driven development is user-owned

The user controls receipt-driven development with a switch: `gentle-ai review mode enable|disable|status`.

- It is **on by default and opt-out**. An unset preference permits review without recording a user decision; explicit global or clone-local OFF still wins. Candidate consent remains separate from the mode default.
- `status` is read-only. It reports the deciding source and the effective mode, and changes nothing. A `default` deciding source means nobody has chosen, so the effective mode is on.
- When the user asks to stop using receipt-driven development, run `disable`. Do not argue, do not work around it, and do not propose alternatives first.
- While it is disabled, keep implementing organically through direct inline or delegated direct: do not start reviews, do not retry, do not reactivate it, and do not fall back to any retired path.
- Delivery under a disabled switch follows ordinary repository policy and reports `disabled/unmanaged`, never a fabricated approval.
- Never toggle the mode automatically or persist a preference just because the default is on. Never enable receipt-driven development on the user's behalf unless the user explicitly asks for it.


### Receipt-driven development is user-owned

The user controls receipt-driven development with a switch: `gentle-ai review mode enable|disable|status`.

- It is **opt-in and off by default**. Until the user explicitly enables it, reviews do not run and delivery follows ordinary repository policy. Do not treat that as a fault to diagnose or work around.
- `status` is read-only. It reports the deciding source and the effective mode, and changes nothing. A `default` deciding source means nobody has chosen, so the effective mode is off.
- When the user asks to stop using receipt-driven development, run `disable`. Do not argue, do not work around it, and do not propose alternatives first.
- While it is disabled, keep implementing organically through direct inline, delegated direct, or optional SDD: do not start reviews, do not retry, do not reactivate it, and do not fall back to any retired path.
- Delivery under a disabled switch follows ordinary repository policy and reports `disabled/unmanaged`, never a fabricated approval.
- Never enable receipt-driven development on the user's behalf unless the user explicitly asks for it.


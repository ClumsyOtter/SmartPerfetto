# Agent Runtime Opaque Continuation Spike

Date: 2026-06-06

Scope: WS-I / T13 from `agent-runtime-abstraction-review.md`.

## Decision

Pi Agent Core and OpenCode both have enough SDK surface in the locked local
versions to support third-party opaque continuation, with runtime-specific
state shapes:

- Pi Agent Core stores a bounded, JSON-safe copy of the agent transcript and
  hydrates it into `Agent` via `initialState.messages`.
- OpenCode stores the OpenCode session id plus durable SmartPerfetto-owned
  project/home/config directories. A restored run starts a new OpenCode server
  with the same directories and prompts the prior session id.

When opaque state is missing, invalid, too large, or no longer accepted by the
third-party SDK, SmartPerfetto falls back to its outer session context and emits
a readable `degraded` event. It does not claim third-party state was restored.

## Evidence

- `@earendil-works/pi-agent-core@0.78.0` exposes `AgentOptions.initialState`,
  writable `agent.state.messages`, `agent.sessionId`, `prompt()`, and
  `continue()` in the installed README and `dist/agent.d.ts`.
- `@opencode-ai/sdk@1.15.13` exposes `session.get`, `session.messages`,
  `session.prompt`, and `session.promptAsync`; each session call accepts a
  `directory` query. The SDK server process inherits `HOME` and
  `OPENCODE_CONFIG_DIR` from the spawning Node process.

## Guardrails

- Pi opaque state is redacted for common secret key names, capped to recent
  messages, and size-limited before entering session metadata.
- OpenCode opaque directories live under `backendDataPath('agent-runtime',
  'opencode', sessionId)` unless an explicit project directory is configured.
  This avoids depending on OS temp-directory retention.
- OpenCode server startup runs inside a module-level mutex while setting
  `HOME` and `OPENCODE_CONFIG_DIR`, because the SDK does not expose a per-spawn
  environment override.
- Existing provider snapshot hash gates still decide whether restore is allowed.
  If provider/runtime configuration changed, the route layer skips
  `restoreFromSnapshot`.

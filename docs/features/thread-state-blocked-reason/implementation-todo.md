# Thread State Blocked Reason Semantics TODO

## Goal

Make SmartPerfetto interpret Perfetto `thread_state` blocking evidence with a
clear evidence boundary:

- `sched_switch` provides the scheduling state (`D`, `S`, `R`, `Running`).
- `sched/sched_blocked_reason` provides `io_wait` and the single-frame kernel
  `blocked_function` wchan.
- `blocked_function` is not a userspace atrace slice and not a full kernel
  stack.
- `D` means uninterruptible sleep; only `io_wait=1` or strong IO/page-cache
  blocked-function evidence should be reported as IO wait.

## Execution Plan

1. Capture config coverage
   - Add `sched/sched_blocked_reason` to SmartPerfetto Android capture presets
     that support scheduler/blocking analysis.
   - Ensure generated startup trace config fragments also request the signal.
   - Add tests against rendered textproto, not just generator metadata.

2. Fixed background knowledge
   - Add `knowledge-thread-state-blocked-reason.template.md`.
   - Update output/scene strategies so high-severity findings with
     `blocked_function`, `io_wait`, or D-state evidence call
     `lookup_knowledge("thread-state-blocked-reason")`.
   - Keep the knowledge block tied to the current trace row/family, not a generic
     textbook dump.

3. Evidence semantics
   - Rename or deprecate misleading `D == IO` wording.
   - Split D-state into direct IO wait, inferred IO/page-cache wait, and
     ambiguous uninterruptible wait.
   - Treat `epoll/poll` as Looper/poll idle-or-ambiguous, not IO wait.
   - Preserve per-function flat aggregation semantics; do not present
     `blocked_function` rows as a nested stack.

4. Report guardrails
   - Add focused tests that reject unsupported wording:
     - D-only evidence cannot become disk IO root cause.
     - `epoll/poll` cannot become IO wait root cause.
     - `blocked_function` cannot be described as a full call stack.

5. Verification
   - `cd backend && npm run validate:skills`
   - `cd backend && npm run validate:strategies`
   - Focused Jest for strategy loading, trace config, capture config, critical
     path, and final-result quality.
   - `cd backend && npm run build`
   - `cd backend && npm run test:scene-trace-regression`
   - `npm run verify:pr`
   - `git diff --check`

## Progress

- [x] Capture config coverage
- [x] Background knowledge template
- [x] Strategy trigger updates
- [x] Skill/TS evidence semantics
- [x] Guardrail tests
- [x] Validation
- [x] Post-diff review fixes: keep `DK` rows in thread blocking SQL and require
      specific IO/page-cache evidence instead of any `blocked_function=` token.

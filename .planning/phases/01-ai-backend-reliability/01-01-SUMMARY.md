---
phase: 01-ai-backend-reliability
plan: 01
subsystem: api
tags: [flowrite, anthropic, ai-review, prompts, testing]
requires: []
provides:
  - per-job AI runtime token ceilings for review, reply, and suggestion jobs
  - issue-focused AI Review prompt policy that prefers margin comments
  - runtime regression coverage for persona routing and session-history persistence
affects: [renderer, ai_review, runtime]
tech-stack:
  added: []
  patterns: [job-aware token caps, margin-first review prompting, runtime contract regression tests]
key-files:
  created: []
  modified:
    - flowrite-marktext/src/main/flowrite/ai/promptBuilder.js
    - flowrite-marktext/src/main/flowrite/controller.js
    - flowrite-marktext/test/unit/specs/flowrite-ai-runtime.spec.js
    - flowrite-marktext/test/unit/specs/flowrite-ai-review-prompts.spec.js
key-decisions:
  - "AI Review now defaults to the full 16384-token output ceiling while reply and suggestion jobs stay capped at 2048."
  - "AI Review prompting now emphasizes the most important issues and prefers margin comments for passage-specific feedback."
patterns-established:
  - "Runtime requests derive max_tokens from job type unless a caller explicitly overrides the value."
  - "AI Review policy changes are locked with direct prompt-builder and runtime persistence assertions."
requirements-completed: [AI-01, AI-02, AI-03, AI-04]
duration: 33 min
completed: 2026-04-15
---

# Phase 01 Plan 01: AI Backend Reliability Summary

**Job-aware AI review token sizing with margin-first review prompting and locked persona/history runtime coverage**

## Performance

- **Duration:** 33 min
- **Started:** 2026-04-15T15:58:00Z
- **Completed:** 2026-04-15T16:31:15Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Raised AI Review request headroom to 16384 tokens while keeping reply and suggestion jobs compact.
- Rewrote AI Review instructions around the most important issues, with global comments reserved for document-wide themes and margin comments preferred for passage-level feedback.
- Added regression coverage for token caps, all three personas, and persisted AI Review conversation history.

## Task Commits

1. **Task 1: Add per-job token ceilings to runtime request construction** - `d85d6c9` (fix)
2. **Task 2: Align the AI Review prompt with Phase 1 comment-policy decisions** - `d85d6c9` (fix)
3. **Task 3: Preserve persona-routing and session-history guarantees with focused runtime assertions** - `d85d6c9` (fix)

## Files Created/Modified
- `flowrite-marktext/src/main/flowrite/ai/promptBuilder.js` - derives default output caps from job type before building Anthropic requests.
- `flowrite-marktext/src/main/flowrite/controller.js` - updates the AI Review prompt policy to target important issues and prefer margin comments.
- `flowrite-marktext/test/unit/specs/flowrite-ai-runtime.spec.js` - covers token ceilings, improvement persona routing, persisted review history, and existing history-failure degradation.
- `flowrite-marktext/test/unit/specs/flowrite-ai-review-prompts.spec.js` - locks the new AI Review wording and guardrails.

## Decisions Made
- Used shared Flowrite job-type constants for token defaults instead of scattering magic strings.
- Kept the existing single-sentence persona instructions and documented them with stronger regression checks rather than expanding persona profiles in Phase 1.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Local unit verification initially failed because `flowrite-marktext/node_modules` was absent and the Electron binary had not been downloaded. Resolved by installing app dependencies with `--legacy-peer-deps`, then downloading and unpacking the Electron runtime directly before rerunning the suite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Renderer-side retry work can rely on the new request sizing and prompt contract.
- No blockers remain for Phase 1 plan 02.

---
*Phase: 01-ai-backend-reliability*
*Completed: 2026-04-15*

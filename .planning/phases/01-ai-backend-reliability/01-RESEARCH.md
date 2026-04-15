# Phase 1: AI Backend Reliability - Research

**Researched:** 2026-04-15
**Status:** Ready for planning
**Source:** Local codebase synthesis (runtime, controller, renderer, tests, and planning artifacts)

## Executive Summary

Phase 1 is not a greenfield build. The AI Review path already works end-to-end:

- `Toolbar.vue` dispatches `RUN_AI_REVIEW`
- Vuex invokes `mt::flowrite:run-ai-review`
- `DataCenter` hands off to `FlowriteController.runAiReview()`
- `FlowriteRuntimeManager` builds the Anthropic request and persists conversation history
- `runtimeWorker.js` executes the tool loop
- `create_comment` side effects persist immediately into `comments.json`

The main remaining reliability gaps are concentrated in two places:

1. **Request shaping is too conservative for AI Review**
   - `buildRuntimeRequest()` defaults `max_tokens` to `1024` for every job type.
   - `buildAiReviewPrompt()` still tells the model to leave `1 to 3` global comments, which conflicts with the context decision to let comment count scale naturally and prefer margin comments.

2. **Failure recovery is functional but not recoverable enough**
   - Partial comments already survive failures because `create_comment` persists side effects immediately.
   - Errors already propagate to renderer runtime state through `mt::flowrite:runtime-progress`.
   - What is still missing is the **retryable failure UX** called for in context decision `D-05`: an error toast with a one-click retry using the same review persona.

## Current Code Findings

### Runtime and Request Construction

- `flowrite-marktext/src/main/flowrite/ai/promptBuilder.js`
  - `buildRuntimeRequest()` already accepts `jobType`, `reviewPersona`, and `maxTokens`.
  - The current default is `maxTokens = 1024`, which is the main truncation risk for AI Review.
  - Persona system instructions are already correctly injected from `REVIEW_PERSONA_INSTRUCTIONS`.
  - Conversation history trimming already preserves tool-use/tool-result pairs.

- `flowrite-marktext/src/main/flowrite/ai/runtimeManager.js`
  - `runJob()` already appends current-turn prompt + assistant conversation entries into the single-session history and persists them to `document.json`.
  - `reviewPersona` already falls through to `documentRecord.lastReviewPersona` when not explicitly passed.
  - History persistence failures are already degraded to a `historyPersistenceFailed` flag instead of rolling back tool side effects.

- `flowrite-marktext/src/main/flowrite/ai/runtimeWorker.js`
  - The loop already fails closed on worker crashes, tool loop overflow, and tool execution failures.
  - Partial results created before a later failure are not rolled back.
  - There are two near-duplicate execution paths: the inline fallback runner and the stringified worker source. Any reliability fix that touches loop semantics should preserve parity.

### AI Review Orchestration

- `flowrite-marktext/src/main/flowrite/controller.js`
  - `runAiReview()` already streams progress after each `create_comment` tool result.
  - `buildAiReviewPrompt()` still contains the fixed `Leave 1 to 3 concise comments` instruction, which is now inconsistent with the locked decisions in `01-CONTEXT.md`.
  - `runAiReview()` does not currently preserve enough renderer-side request metadata to implement the "Retry with same persona" UX by itself, but the renderer can store that request before invoking IPC.

### Renderer and Notification Surface

- `flowrite-marktext/src/renderer/store/modules/flowrite.js`
  - Runtime progress is already centralized in Vuex.
  - `RUN_AI_REVIEW` already knows the exact `{ reviewPersona, prompt }` payload, which makes it the best place to stash the last AI review request for retry.
  - No existing action shows an AI Review-specific retry toast on runtime failure.

- `flowrite-marktext/src/renderer/services/notification/index.js`
  - Existing notification service already supports `showConfirm: true`.
  - The promise resolves on confirm and rejects on close, which is sufficient for a retry action without building a new toast system.

### Existing Coverage Worth Reusing

The codebase already has unusually good test coverage for this phase:

- `test/unit/specs/flowrite-ai-runtime.spec.js`
  - Covers tool loop execution, persona propagation, history persistence, tool-loop overflow, worker recovery, stale tool results, and persistence failure degradation.
- `test/unit/specs/flowrite-ai-review.spec.js`
  - Covers multi-comment review progress and the guarantee that final assistant free text is not persisted as a comment.
- `test/unit/specs/flowrite-ai-review-prompts.spec.js`
  - Covers AI Review prompt wording; this test will need to change with the prompt policy change.
- `test/unit/specs/flowrite-renderer-store.spec.js`
  - Good place to add retry-request bookkeeping and runtime-failure UX assertions.
- `test/e2e/flowrite-ai-review.spec.js`
  - Already exercises the real `Toolbar.vue` + `HaveALookPopover.vue` entry point.

## Implications for Planning

### Best Plan Split

The cleanest split is:

1. **Core runtime and request hardening**
   - Per-job token limits
   - AI Review prompt policy update
   - Preserve/codify persona and history guarantees with focused unit tests

2. **Recoverable failure UX**
   - Store the last AI review request in renderer state
   - Show retryable error toast on AI Review failure
   - Prove partial comments remain visible after failure
   - Lock the retry path with store- or controller-level tests

This split keeps most file ownership clean:

- Plan 1 can stay in the main-process runtime layer plus prompt tests
- Plan 2 can stay mostly in the renderer store/notification layer plus review failure tests

### Requirements That Are Already Mostly Satisfied

These requirements appear implemented already, but Phase 1 should still protect them with stronger tests where needed:

- `AI-02`: AI Review can already create both global and margin comments in one pass because the review job exposes `create_comment` and the prompt allows both scopes.
- `AI-03`: Persona-specific system instructions are already present in `buildRuntimeRequest()`.
- `AI-04`: Conversation history is already appended in `runtimeManager.runJob()`.

Planning should treat these as **verification-and-hardening work**, not fresh feature work.

### Requirements That Need Real Changes

- `AI-01`: Needs per-job-type `max_tokens` defaults, with AI Review lifted to the user-decided `16384`.
- `AI-05`: Needs the failure UX to become recoverable, not merely visible.
- Context decision `D-06`: Requires prompt text changes so comment count is no longer hard-coded.

## Recommended Verification Commands

Use project-native commands from `flowrite-marktext/package.json`:

- `npm --prefix flowrite-marktext run unit`
- `npm --prefix flowrite-marktext run e2e -- test/e2e/flowrite-ai-review.spec.js`
- `npm --prefix flowrite-marktext run eval:flowrite`

For task-level acceptance checks, pair those with grep-verifiable assertions on the edited files.

## Risks to Carry Into the Plans

### Risk 1: Fix applied only to one runtime path

`runtimeWorker.js` has both inline and worker-thread implementations. If a reliability change is applied to one and not the other, behavior diverges between environments.

**Planning response:** any runtime-loop change must explicitly read and verify both code paths.

### Risk 2: Retry path reuses stale or incomplete request state

If retry logic only remembers the persona and not the prompt, or only remembers the last successful review instead of the last attempted review, the UX will violate `D-05`.

**Planning response:** store the exact last AI Review request at dispatch time in renderer state and reuse that object for retry.

### Risk 3: Prompt-policy change regresses existing tests

Prompt wording is directly asserted in `flowrite-ai-review-prompts.spec.js`.

**Planning response:** update tests in the same plan as the prompt change so the suite documents the new policy rather than fighting it.

### Risk 4: Error UX leaks into unrelated Flowrite jobs

Global comments and margin replies also use runtime progress state. AI Review retry UX should not trigger on every runtime failure in the app.

**Planning response:** scope retry toast behavior to `phase === PHASE_AI_REVIEW`.

## Planning Recommendations

- Keep the phase at **2 plans**, matching the roadmap placeholder.
- Put runtime-layer file changes and prompt updates in the first plan.
- Put retry toast + last-review-request state + failure-path tests in the second plan.
- Require both plans to reference the existing unit/e2e specs in `<read_first>` so execution reuses existing coverage patterns instead of inventing new ones.
- Include a `<threat_model>` block in every plan. For this phase, the relevant STRIDE concerns are:
  - prompt injection from document content
  - denial of service via runaway tool loops / oversized review output
  - duplicated or stale retries causing repeated AI jobs or wrong-persona reruns

## Exit Criteria for Planning

Planning is good enough when the resulting `PLAN.md` files:

- cover `AI-01` through `AI-05` without gaps
- make `AI-02` through `AI-04` explicit as hardening/verification work where implementation already exists
- keep runtime-layer and renderer-layer file ownership mostly separate
- include concrete verification commands tied to the existing Flowrite unit/e2e/eval suite

---

*Phase: 01-ai-backend-reliability*
*Research synthesized: 2026-04-15*

# Phase 3: Cleanup & Verification - Research

**Researched:** 2026-04-16
**Status:** Ready for planning
**Source:** Local codebase synthesis (renderer entry points, prompt builder, eval harness, roadmap, and prior phase artifacts)

## Executive Summary

Phase 3 is a cleanup-and-proof phase, not a new feature build. The core Have a Look path is already live:

- `titleBar/index.vue` mounts `Toolbar.vue`
- `Toolbar.vue` launches `HaveALookPopover.vue`
- `FlowriteController.runAiReview()` builds the review prompt and routes persona choice into the runtime request
- `test/e2e/flowrite-ai-review.spec.js` already exercises the real toolbar/popover flow

Two gaps remain:

1. `AiReviewButton.vue` is still dead code in the repo
   - It is not imported anywhere under `flowrite-marktext/src` or `flowrite-marktext/test`
   - It duplicates an older review trigger path that was superseded by `Toolbar.vue`

2. Persona verification is only partial
   - `flowrite-ai-runtime.spec.js` proves the three persona system instructions differ
   - `test/evals/flowrite-smoke.spec.js` proves live responses come back and that the persona instructions are different
   - No existing artifact yet proves that the three personas produce noticeably different review tone and content on the same document, and no human-reviewed report exists for that claim

The cleanest Phase 3 split is:

- Plan 01: remove the dead component and refresh the surviving entry-point contract
- Plan 02: strengthen persona verification, generate a live eval artifact, and add a human judgment checkpoint for appropriateness

## Current Code Findings

### Dead-Code Cleanup Readiness

- `flowrite-marktext/src/renderer/components/flowrite/AiReviewButton.vue`
  - Exists as a fully styled standalone component
  - Is not imported by any live renderer file
  - Still exposes stale test IDs like `flowrite-ai-review`

- `flowrite-marktext/src/renderer/components/titleBar/index.vue`
  - Imports and mounts `Toolbar.vue`, not `AiReviewButton.vue`

- `flowrite-marktext/src/renderer/components/flowrite/Toolbar.vue`
  - Is the real review entry point
  - Owns persona state, prompt state, busy state, and dispatch to `RUN_AI_REVIEW`

Implication: deleting `AiReviewButton.vue` is low-risk as long as the toolbar path stays untouched and repo searches confirm no lingering code references.

### Persona Verification Starting Point

- `flowrite-marktext/src/main/flowrite/ai/promptBuilder.js`
  - `REVIEW_PERSONA_INSTRUCTIONS` is still only three single-sentence strings
  - The instructions are distinct, but the distinction is intentionally lightweight

- `flowrite-marktext/test/unit/specs/flowrite-ai-runtime.spec.js`
  - Already asserts that persona metadata and system instructions differ for friendly, critical, and improvement

- `flowrite-marktext/test/evals/flowrite-smoke.spec.js`
  - Already calls the live gateway on the same fixture for all three personas
  - Only checks that the instructions differ and that each response is non-empty or comment-first
  - Does not yet compare output bodies in a way that closes `CLN-02`

### Scope Boundary With Phase 4

Roadmap Phase 4 is explicitly reserved for a larger persona-voice redesign:

- richer persona profiles
- tone examples
- focus areas
- anti-patterns

Implication: Phase 3 should do the minimum hardening needed to verify distinctness on real documents. It should not balloon into full persona redesign work.

### Existing Verification Assets Worth Reusing

- `flowrite-marktext/test/unit/specs/flowrite-toolbar.spec.js`
  - Good place to keep the canonical toolbar entry path explicit after dead-code removal

- `flowrite-marktext/test/e2e/flowrite-ai-review.spec.js`
  - Already proves the shipped Have a Look trigger works through the real renderer flow

- `flowrite-marktext/test/evals/fixtures/reflection-draft.md`
  - Small but useful same-document fixture for persona comparison

## Planning Implications

### Best Plan Split

Keep Phase 3 at **2 plans**:

1. **Legacy entry-point cleanup**
   - Delete `AiReviewButton.vue`
   - Refresh the surviving toolbar contract in tests and structure docs

2. **Persona distinction verification**
   - Keep persona instructions lightweight but explicit enough to compare
   - Upgrade the live eval from “responses exist” to “responses differ in tone/content on the same fixture”
   - Generate a markdown artifact that a human can review for appropriateness

### What Already Looks Good

- The live Have a Look path is already exercised through the toolbar/popover flow
- Persona choice already propagates into `buildRuntimeRequest()`
- The runtime already persists review history and selected persona metadata

Planning should treat these as **verification and hardening work**, not greenfield implementation.

### What Needs Real New Work

- `CLN-01`: delete the dead component and stop describing it as part of the live renderer tree
- `CLN-02`: turn the existing live eval into a same-document persona-difference proof with a human-reviewable artifact

## Risks To Carry Into The Plans

### Risk 1: “Different prompts” gets mistaken for “different output”

The current tests prove persona instructions differ, but that is weaker than the roadmap requirement.

**Planning response:** require a live eval that compares outputs from the same fixture and records samples.

### Risk 2: Phase 3 accidentally absorbs Phase 4 persona-design scope

The current persona strings are intentionally lightweight. A large rewrite here would front-run the next roadmap phase.

**Planning response:** allow only minimal prompt-side tuning in Phase 3, with an explicit guardrail against adding rich persona bios or examples.

### Risk 3: Live eval silently skips because the gateway key is missing

`test/evals/flowrite-smoke.spec.js` currently uses an env-gated `describe.skip` pattern.

**Planning response:** the plan should make the `AI_GATEWAY_API_KEY` dependency explicit and should not count a skipped eval as successful Phase 3 verification.

### Risk 4: Cleanup leaves stale internal docs behind

`STRUCTURE.md` and other planning notes still mention `AiReviewButton.vue`.

**Planning response:** include a small documentation refresh in the cleanup plan so future work does not target the removed component.

## Recommended Verification Commands

- `npm --prefix flowrite-marktext run unit`
- `npm --prefix flowrite-marktext run e2e -- test/e2e/flowrite-ai-review.spec.js`
- `npm --prefix flowrite-marktext run eval:flowrite`
- `rg -n "AiReviewButton" flowrite-marktext/src flowrite-marktext/test`

## Planning Recommendations

- Create **two** plans, both eligible for Wave 1 because they do not share source files
- Make the persona-verification plan `autonomous: false` because final “appropriate voice” judgment is human, not purely mechanical
- Use the existing `reflection-draft.md` fixture instead of inventing a new evaluation harness from scratch
- Keep acceptance criteria grep-verifiable and command-verifiable; avoid vague wording like “feels distinct”

## Exit Criteria For Planning

Planning is good enough when the resulting `PLAN.md` files:

- cover both `CLN-01` and `CLN-02`
- keep cleanup work separate from persona verification work
- treat the toolbar/popover flow as the only real review entry path
- produce a live persona-eval artifact plus a human judgment gate

---

*Phase: 03-cleanup-verification*
*Research synthesized: 2026-04-16*

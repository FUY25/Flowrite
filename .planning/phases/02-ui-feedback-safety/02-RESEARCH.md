# Phase 2: UI Feedback & Safety - Research

**Researched:** 2026-04-16
**Status:** Ready for planning
**Source:** Local codebase synthesis (renderer components, Vuex store, controller progress events, and current tests)

## Executive Summary

Phase 2 is a UI-hardening phase, not a blank-slate frontend build. The key review surfaces already exist in production code:

- `Toolbar.vue` already launches Have a Look through the real `HaveALookPopover.vue` entry point.
- `GlobalComments.vue` already displays runtime status and AI review output in the bottom discussion panel.
- `MarginCommentLayer.vue`, `MarginCommentDots.vue`, and `MarginAnchorHighlights.vue` already render anchored margin feedback from persisted comments.
- `flowrite.js` already stores `lastAiReviewRequest`, tracks `inFlightAnchors`, and shows the retry toast on AI review failure.
- `test/e2e/flowrite-ai-review.spec.js` already drives the real toolbar/popover path, so some older planning docs are now stale.

The remaining work is concentrated in three gaps:

1. **Progress and result surfacing are only partly user-visible**
   - The toolbar button disables correctly, but the popover itself has no busy/read-only state.
   - Margin results can exist in store data before they are easy to notice as rail output.
   - The review progress copy is present, but it is not yet a tightly designed, end-to-end "review is happening now" experience.

2. **Margin rail positioning still has a real UX bug**
   - `MarginCommentLayer.vue` and `MarginCommentDots.vue` refresh on resize and content mutations, but not on editor scroll.
   - This can make rail cards and dots drift away from their paragraphs until another refresh trigger occurs.

3. **The safety half of the phase is mostly scaffolding today**
   - `state.flowrite.inFlightAnchors` exists, and store tests cover it.
   - No main-process review path actually emits those anchors during Have a Look.
   - No renderer component consumes them to visually lock or block editing on anchored ranges.

## Current Code Findings

### What Already Works

#### Review entry and button disabling

- `flowrite-marktext/src/renderer/components/flowrite/Toolbar.vue`
  - The mounted Have a Look entry point is the toolbar, not the dead `AiReviewButton.vue`.
  - The review button is disabled whenever `runtime.status === RUNTIME_STATUS_RUNNING`.
  - The CTA label already swaps from `Have a look!` to `Looking…`.

#### Global discussion rendering

- `flowrite-marktext/src/renderer/components/flowrite/GlobalComments.vue`
  - Global comments render from the persisted global thread.
  - Runtime status text is already shown below the composer.
  - Failed runtime states already surface `runtime.error.message`.

#### AI review progress plumbing

- `flowrite-marktext/src/main/flowrite/controller.js`
  - `runAiReview()` sends a running progress payload before the job starts.
  - After each `create_comment` tool result, it sends `Flowrite added N review comments...`.
  - `sendPersistedRefresh()` pushes updated comments to the renderer after each tool result.

#### Existing retry and review-request state

- `flowrite-marktext/src/renderer/store/modules/flowrite.js`
  - `RUN_AI_REVIEW` already stores `lastAiReviewRequest`.
  - AI review failures already trigger a retryable notification.
  - Terminal runtime states already clear `inFlightAnchors`.

#### Actual test entry point

- `flowrite-marktext/test/e2e/flowrite-ai-review.spec.js`
  - The e2e test already clicks the real toolbar button and popover.
  - This means the older concern note claiming the toolbar path is untested is stale.

### What Is Partially Implemented but Not Yet Good Enough

#### Review popover safety

- `HaveALookPopover.vue` does not receive any busy prop.
- The Go button, persona pills, and prompt textarea do not become disabled while a review is running.
- `Toolbar.runReview()` guards repeat submission in code, but the visible popover state is still interactive enough to feel unfinished and leaves room for double-click races.

#### Margin output discoverability

- AI review tool results already refresh persisted comments incrementally.
- However, Phase 2's goal is not only "data exists"; it is "users see feedback live."
- Margin comments need stronger UI-level surfacing and verification as actual rail cards, not just stored threads.

### Real Gaps Still Blocking Phase Acceptance

#### Gap 1: Scroll-driven rail drift

- `flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- `flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue`

Both components calculate visual positions from `getBoundingClientRect()` plus `scrollTop`, but neither attaches a scroll listener to the editor container. This is the most direct blocker to UI-02 being trustworthy during real document navigation.

#### Gap 2: No emitted in-flight review anchors

- `flowrite-marktext/src/main/flowrite/controller.js`
- `flowrite-marktext/src/renderer/store/modules/flowrite.js`

The store knows how to hold `inFlightAnchors`, but `runAiReview()` never sends them. That means the safety mechanism Phase 2 depends on is present in state shape only.

#### Gap 3: No locked-range UI or edit blocking

- `flowrite-marktext/src/renderer/components/flowrite/MarginAnchorHighlights.vue`

The highlight layer only uses persisted thread anchors. It does not:

- render a distinct locked-range highlight for in-flight review anchors
- prevent text edits inside those ranges
- surface a lock notice when the user tries to type through an active review range

## Planning Implications

### Best Plan Split

Keep Phase 2 at the roadmap's planned **2 plans**, but split by responsibility rather than by component type:

1. **Live review feedback and result surfacing**
   - Toolbar/popover busy state
   - Runtime copy polish
   - Margin rail and dot scroll-sync fix
   - Mixed-scope AI review verification through the actual toolbar entry point

2. **In-flight range locking**
   - Emit anchor payloads during AI review
   - Store and consume those anchors
   - Highlight and block edits on locked ranges
   - Add focused unit/e2e coverage for the lock path

This split keeps files mostly separate:

- Plan 01 stays in the view layer and e2e/UI verification surface
- Plan 02 stays in controller/store/highlight safety logic

### Requirements Already Close to Satisfied

- `UI-01`: Runtime progress text already exists in the discussion panel and button state, but needs explicit UX hardening.
- `UI-03`: Global AI review comments already render in `GlobalComments.vue`.
- `UI-05`: The main toolbar button already disables during running status, but the popover path still needs safety polish.

Planning should treat these as **UI hardening + verification**, not greenfield features.

### Requirements Requiring Real New Work

- `UI-02`: Needs scroll-stable margin rail behavior and mixed-scope AI review coverage.
- `UI-04`: Needs both main-process progress emission and renderer-side edit blocking.

## Risks to Carry into the Plans

### Risk 1: Planning against stale analysis instead of current code

Older `.planning/codebase/*.md` notes still describe some issues that are now fixed in code or tests.

**Planning response:** every task should read the live source files first, not rely on planning docs as canonical truth.

### Risk 2: Locked-range protection fights Muya editor behavior

The editor stack is Muya inside a Vue/Electron shell. Over-aggressive DOM event blocking could break selection, navigation, or unrelated editing outside the targeted range.

**Planning response:** implement range-scoped guards only, and prove them with focused tests instead of broad event suppression.

### Risk 3: Rail refresh fixes regress performance

Both margin components already do expensive DOM reads. Adding scroll listeners can fix correctness but also increase layout churn.

**Planning response:** reuse the existing `scheduleRefresh()` RAF throttling rather than adding synchronous recalculation on every scroll event.

## Recommended Verification Commands

Use project-native checks:

- `npm --prefix flowrite-marktext run unit`
- `npm --prefix flowrite-marktext run e2e -- test/e2e/flowrite-ai-review.spec.js`
- `npm --prefix flowrite-marktext run e2e -- test/e2e/flowrite-ai-review-locking.spec.js`

## Exit Criteria for Planning

Planning is good enough when the resulting plans:

- cover `UI-01` through `UI-05` without repeating already-landed Phase 1 work
- distinguish current code reality from stale analysis docs
- keep UI surfacing work mostly separate from lock-enforcement work
- require real verification of mixed-scope AI review output and locked-range edit blocking

---

*Phase: 02-ui-feedback-safety*
*Research synthesized: 2026-04-16*

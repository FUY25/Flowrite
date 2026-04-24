---
phase: 02-ui-feedback-safety
plan: 01
subsystem: ui
tags: [vue, electron, playwright, flowrite]
requires:
  - phase: 01-ai-backend-reliability
    provides: stable AI review progress and mixed-scope comment persistence
provides:
  - review-running toolbar and popover states tied to real runtime status
  - mixed-scope AI review output in global discussion and margin surfaces
  - scroll-stable margin cards and dots during editor navigation
affects: [02-02-locking, 03-cleanup-verification]
tech-stack:
  added: []
  patterns: [runtime-phase-specific UI copy, RAF-based overlay refresh on scroll]
key-files:
  created: [flowrite-marktext/test/unit/specs/flowrite-toolbar.spec.js]
  modified:
    - flowrite-marktext/src/renderer/components/flowrite/Toolbar.vue
    - flowrite-marktext/src/renderer/components/flowrite/HaveALookPopover.vue
    - flowrite-marktext/src/renderer/components/flowrite/GlobalComments.vue
    - flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue
    - flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue
    - flowrite-marktext/test/e2e/flowrite-ai-review.spec.js
key-decisions:
  - Keep `Toolbar.vue` as the sole visible AI review entry point and derive its busy state from `runtime.phase` plus `runtime.status`.
  - Reuse the existing discussion panel and margin rail instead of introducing a dedicated review-results surface.
patterns-established:
  - Review-specific copy branches on `PHASE_AI_REVIEW` while generic runtime plumbing stays unchanged.
  - Margin overlay geometry refreshes stay funneled through `scheduleRefresh()` on resize and scroll.
requirements-completed: [UI-01, UI-02, UI-03, UI-05]
duration: 35min
completed: 2026-04-16
---

# Phase 2: ui-feedback-safety Summary

**Live AI review now shows durable progress, routes mixed-scope comments to the right surfaces, and keeps rail annotations aligned during scroll.**

## Performance

- **Duration:** 35 min
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- The real Have a Look button now switches to `Reviewing...`, stays disabled during runtime work, and keeps the popover controls read-only while review is active.
- Global review progress and comments surface in the bottom discussion panel, while margin review comments show up as actual thread cards and paragraph dots.
- Margin cards and dots now refresh on editor scroll through the existing RAF-based overlay layout path, so anchored feedback stays visually attached to the right paragraphs.

## Task Commits

1. **Task 1: Make the Have a Look toolbar and popover visibly busy and non-retriggerable during review** - `uncommitted`
2. **Task 2: Keep margin cards and dots aligned with their paragraphs during scroll and resize** - `uncommitted`
3. **Task 3: Prove mixed-scope AI review output appears in the correct UI surfaces** - `uncommitted`

## Files Created/Modified

- `flowrite-marktext/src/renderer/components/flowrite/Toolbar.vue` - Drives the review CTA label, disable state, and popover busy props from live runtime state.
- `flowrite-marktext/src/renderer/components/flowrite/HaveALookPopover.vue` - Locks persona, prompt, and action controls while review is running and shows runtime helper copy.
- `flowrite-marktext/src/renderer/components/flowrite/GlobalComments.vue` - Prefers AI-review-specific status copy in the global discussion surface.
- `flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue` - Refreshes card placement when the editor scrolls.
- `flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue` - Refreshes paragraph-dot placement when the editor scrolls.
- `flowrite-marktext/test/unit/specs/flowrite-toolbar.spec.js` - Covers the real toolbar label and disabled-state behavior during AI review.
- `flowrite-marktext/test/e2e/flowrite-ai-review.spec.js` - Verifies the toolbar path plus global and margin review rendering in the live Electron app.

## Decisions & Deviations

None on scope. The implementation followed the plan and kept the shipped UI path centered on the existing toolbar, discussion panel, and annotation rail instead of adding any new review-only chrome.

## Next Phase Readiness

- The renderer now exposes a trustworthy live-review state for the locking work in `02-02` to build on.
- Phase 3 can treat the toolbar path and mixed-scope review surfacing as the canonical user-facing behavior.

# Flowrite: Have a Look AI Review

## What This Is

The "Have a Look" feature in Flowrite — a one-click AI review that reads the entire document and generates both global comments and margin comments in a single pass. The user picks a persona (Friendly, Critical, Improvement) and the AI produces thoughtful, multi-comment feedback. This is the flagship AI feature that distinguishes Flowrite from other markdown editors.

## Core Value

A writer can click one button and receive intelligent, multi-location document feedback — both in the margin (passage-specific) and in global discussion (document-wide) — without leaving their draft.

## Requirements

### Validated

- ✓ Have a Look button UI with 3 personas (Friendly, Critical, Improvement) — existing in `Toolbar.vue` + `HaveALookPopover.vue`
- ✓ Full IPC chain: Vuex `RUN_AI_REVIEW` → `mt::flowrite:run-ai-review` → `FlowriteController.runAiReview()` → RuntimeManager → Worker → Anthropic API
- ✓ `create_comment` tool supports both `scope: "global"` and `scope: "margin"` with anchors
- ✓ AI Review job type (`JOB_TYPE_AI_REVIEW`) registered in tool registry with `create_comment` available
- ✓ Comment guardrails strip markdown formatting in commenting mode (DD-006)
- ✓ Collaboration routing selects persona-appropriate system prompt
- ✓ Sidebar margin cards display comments with dot indicators
- ✓ Global discussion panel displays conversation threads
- ✓ Sidecar persistence for comments (`commentsStore.js`) and conversation history (`documentStore.js`)

### Active

- [ ] Increase `max_tokens` from 1024 to ≥4096 for AI Review jobs — current cap truncates multi-comment responses
- [ ] Surface AI Review progress in the UI — streaming status from `mt::flowrite:runtime-progress` to show "reviewing..." state
- [ ] Enforce text locking during AI response — consume `inFlightAnchors` state to visually lock/disable editing on anchored ranges
- [ ] Handle truncated/malformed tool_use responses gracefully — show partial results + error toast instead of silent failure
- [ ] Clean up dead code: remove unmounted `AiReviewButton.vue`
- [ ] Verify Have a Look end-to-end with all 3 personas against a real document
- [ ] Ensure margin comments from AI Review anchor correctly to document paragraphs
- [ ] Ensure AI Review respects single-session model — review comments join existing conversation history

### Out of Scope

- Suggestion/rewrite cards (M2 feature — separate milestone)
- `save_memory` tool implementation (M5 feature)
- Voice Flow mode (M6 feature)
- Auto-save and version history (M3 feature)
- CLI tools (M4 feature)
- Always-on ambient reviewing mode (V2+ feature)
- Cross-file context (deferred — avoids Obsidian scope creep)

## Context

**Codebase state:** Flowrite is a clean vertical slice grafted onto MarkText. The AI pipeline (worker_thread → Anthropic SDK → Vercel gateway) is fully functional for thread replies and margin comments. Have a Look shares this same pipeline but hasn't been end-to-end tested with adequate token limits.

**Key architecture:** Single AI session per article (DD-001). All comment types share one conversation history in `.flowrite/document.json`. The Vuex store (`flowrite.js`) is the single source of truth for UI state; sidecar files are the persistence layer.

**Known issues from codebase analysis:**
- `max_tokens = 1024` in `promptBuilder.js` line 191 — blocks multi-comment AI Review
- `inFlightAnchors` state tracked but never consumed by UI
- `AiReviewButton.vue` is dead code (superseded by `Toolbar.vue`)
- Token estimation uses rough char/4 heuristic — may misfire for CJK text
- Worker thread uses `eval: true` with inline source string (tech debt, not blocking)

**Business context:** Have a Look is the first feature to ship in the open source version. It's the "code review for writing" differentiator. Must work reliably before the GitHub launch.

## Constraints

- **Tech stack**: Electron + Vue 2 + Vuex + Muya (MarkText fork) — no migration
- **AI backend**: Anthropic SDK via Vercel AI gateway — keep current gateway, target direct API later
- **Comments format**: Plain text only, no markdown (DD-006)
- **Session model**: Single session per article (DD-001) — AI Review joins existing history
- **API key**: User's own key via Electron safeStorage — no subscription harnessing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| DD-001: Single AI session per article | Simpler arch, full cross-thread context | — Pending |
| DD-005: Comment-first AI behavior | Writing First philosophy | — Pending |
| DD-006: Plain text comments only | Follows Notion/Lark convention | — Pending |
| Increase max_tokens for AI Review | 1024 truncates multi-comment responses | — Pending |
| Remove AiReviewButton.vue dead code | Superseded by Toolbar.vue; causes confusion | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after initialization*

# Phase 1: AI Backend Reliability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 01-ai-backend-reliability
**Areas discussed:** Token budget & limits, Partial failure behavior, Review comment count & depth, Persona voice definition

---

## Token Budget & Limits

| Option | Description | Selected |
|--------|-------------|----------|
| Per-job-type limits | AI Review gets higher cap, thread replies stay lower. Matches output complexity per job. | ✓ |
| Uniform 4096 for all jobs | Simple — every AI call gets 4096. | |
| Uniform 8192 for all jobs | Generous cap across the board. | |

**User's choice:** Per-job-type limits
**Notes:** User agreed this matches the different output complexity per job type.

---

| Option | Description | Selected |
|--------|-------------|----------|
| 4096 (minimum per AI-01) | Enough for 3-4 comments. May still truncate on detailed reviews. | |
| 8192 | Comfortable headroom for 5+ comments with anchors. | |
| You decide | Claude picks based on testing. | |

**User's choice:** "Do more research online" — user wanted evidence-based decision.
**Notes:** Conducted Anthropic API docs research. Found: max_tokens is a cap not a cost commitment, Sonnet 4.x supports 16384 max output. Led to follow-up question.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Model max for reviews (16384) | Eliminates truncation entirely. No extra cost. | ✓ |
| Keep 8192 for reviews | Very generous, truncation unlikely but possible. | |
| Model max for ALL job types | 16384 across the board. Thread replies wouldn't use it. | |

**User's choice:** Model max for reviews (16384), thread replies and suggestions at 2048.
**Notes:** Research-driven upgrade from initial 8192 recommendation. Key insight: max_tokens cap has zero cost impact.

---

## Partial Failure Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Keep partial results | Comments created before failure stay visible + error toast. | ✓ |
| Roll back all comments | Delete all comments from failed review pass. Clean slate. | |
| You decide | Claude picks based on implementation complexity. | |

**User's choice:** Keep partial results
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Toast only | Brief toast notification. Lightweight. | |
| Toast + retry button | Toast with inline "Retry" action to re-trigger review. | ✓ |
| You decide | Claude picks simplest implementation. | |

**User's choice:** Toast + retry button
**Notes:** User initially questioned whether unlimited tokens could eliminate errors entirely (which it does for truncation). After clarifying that network/API errors are the remaining failure mode, chose retry button for convenience on transient errors.

---

## Review Comment Count & Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Scale with length | Tiered: short docs 1-2, medium 2-4, long 3-6 comments. | |
| Fixed 1-3 comments | Keep current prompt. Simple and predictable. | |
| Let the AI decide naturally | Remove numeric constraint. Model decides based on content. | ✓ |

**User's choice:** Let the AI decide naturally
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Prefer margin comments | Passage-specific is the star feature. Global for document-wide only. | ✓ |
| Even mix | Roughly equal global and margin comments. | |
| You decide | Claude picks the right mix. | |

**User's choice:** Prefer margin comments
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Concise annotations | 1-3 sentences. Annotation-style. | |
| Detailed paragraphs | 3-5 sentences with reasoning. | |
| You decide | Claude picks, may vary by persona. | ✓ |

**User's choice:** You decide
**Notes:** Comment length is Claude's discretion, may vary by persona.

---

## Persona Voice Definition

**User's choice:** Deferred to Phase 4 (Persona Voice Design)
**Notes:** User interrupted discussion to add a dedicated phase for persona design. Single-sentence instructions ship as-is in Phase 1. Friendly persona was partially discussed (user chose "Supportive writing coach" model) before deferring.

Partial decisions before deferral:
- Agreed to expand from single sentences to 3-5 sentence profiles (deferred to Phase 4)
- Friendly = Supportive writing coach (captured for Phase 4)
- Critical = Tough but fair editor (captured for Phase 4)
- Improvement = not discussed (deferred)

---

## Claude's Discretion

- Comment length and detail level per persona
- Exact comment distribution across margin vs global
- How many comments per review

## Deferred Ideas

- Persona Voice Design — added as Phase 4
- Streaming progress (messages.stream()) — noted in CONCERNS.md
- Token estimation improvement — char/4 heuristic replacement

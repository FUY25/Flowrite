# Roadmap: Flowrite Have a Look AI Review

## Overview

The AI pipeline for Have a Look is wired end-to-end but breaks under real usage: responses truncate at 1024 tokens, errors fail silently, and the UI lacks progress feedback or safety rails. This roadmap moves through three phases -- fix the AI backend so it produces complete multi-comment reviews, wire the UI so users see progress and results correctly, then clean up dead code and verify all three personas work distinctly. Each phase delivers a testable capability on top of the last.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: AI Backend Reliability** - Fix token limits, error handling, persona routing, and session history so AI Review produces complete multi-comment responses
- [x] **Phase 2: UI Feedback & Safety** - Surface review progress, display comments correctly, and protect in-flight text ranges from editing (completed 2026-04-16)
- [ ] **Phase 3: Cleanup & Verification** - Remove dead code and verify all three personas produce distinct, appropriate review styles

## Phase Details

### Phase 1: AI Backend Reliability
**Goal**: AI Review produces complete, multi-comment responses for all three personas without truncation or silent failure
**Depends on**: Nothing (first phase)
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):
  1. User triggers Have a Look on a multi-paragraph document and receives both global AND margin comments in a single review pass (no truncation mid-response)
  2. User triggers Have a Look with each persona (Friendly, Critical, Improvement) and the system prompt delivered to the API differs per selection
  3. After an AI Review completes, the review conversation entries appear in the document's conversation history and persist across app restart
  4. When the API returns a truncated or malformed tool_use response, the user sees an error toast and any partial comments that were created before the failure are still visible
**Plans**: 2 planned

Plans:
- [x] 01-01: Harden AI Review request construction and prompt policy
- [x] 01-02: Add recoverable AI Review failure handling

### Phase 2: UI Feedback & Safety
**Goal**: Users see live progress during AI Review and results render correctly as sidebar margin cards and global discussion entries, with editing disabled on in-flight text ranges
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. After clicking Have a Look, user sees a "Reviewing..." progress indicator that persists until the review completes or fails
  2. Margin comments from AI Review appear as sidebar cards positioned next to the correct paragraphs in the document
  3. Global comments from AI Review appear in the bottom discussion panel as new entries
  4. While AI Review is in progress, text ranges referenced by the review are visually marked and editing is disabled on those ranges
  5. The Have a Look button is disabled (unclickable) while any AI job is running, preventing double-trigger
**Plans**: 2 planned
**UI hint**: yes

Plans:
- [x] 02-01: Harden live AI review feedback and mixed-scope result surfacing
- [x] 02-02: Lock in-flight review ranges and block edits on referenced text

### Phase 3: Cleanup & Verification
**Goal**: Dead code removed and all three personas verified to produce distinct, high-quality review output on real documents
**Depends on**: Phase 2
**Requirements**: CLN-01, CLN-02
**Success Criteria** (what must be TRUE):
  1. AiReviewButton.vue is deleted from the codebase and no imports reference it
  2. Running Have a Look with each of the three personas (Friendly, Critical, Improvement) on the same document produces noticeably different comment tones and content
**Plans**: 2 planned

Plans:
- [x] 03-01: Delete the legacy AiReviewButton path and refresh the surviving toolbar contract
- [ ] 03-02: Prove persona distinction on a real fixture and capture a human-reviewed eval artifact

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. AI Backend Reliability | 2/2 | Completed | 2026-04-15 |
| 2. UI Feedback & Safety | 2/2 | Complete    | 2026-04-16 |
| 3. Cleanup & Verification | 1/2 | In progress | - |

### Phase 4: Persona Voice Design - Expand the three persona instructions (Friendly, Critical, Improvement) from single sentences to rich behavioral profiles with tone examples, focus areas, and anti-patterns

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 3
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 4 to break down)

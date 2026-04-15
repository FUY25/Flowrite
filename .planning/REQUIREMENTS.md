# Requirements: Flowrite Have a Look AI Review

**Defined:** 2026-04-15
**Core Value:** A writer can click one button and receive intelligent, multi-location document feedback without leaving their draft.

## v1 Requirements

Requirements for making Have a Look work reliably end-to-end.

### AI Backend

- [ ] **AI-01**: AI Review job uses `max_tokens` ≥ 4096 (currently 1024 causes truncation of multi-comment responses)
- [ ] **AI-02**: AI Review produces both global comments AND margin comments in a single pass using `create_comment` tool
- [ ] **AI-03**: AI Review respects persona selection (Friendly, Critical, Improvement) — collaboration routing delivers persona-appropriate system prompt
- [ ] **AI-04**: AI Review conversation entries are appended to the single-session history (DD-001 compliance)
- [ ] **AI-05**: Truncated or malformed tool_use responses are handled gracefully — partial results displayed + error toast shown to user

### UI & Progress

- [ ] **UI-01**: User sees a "Reviewing..." progress indicator after clicking Have a Look (consume `mt::flowrite:runtime-progress` events)
- [ ] **UI-02**: Margin comments from AI Review appear as sidebar cards anchored to the correct document paragraphs
- [ ] **UI-03**: Global comments from AI Review appear in the bottom discussion panel
- [ ] **UI-04**: Text ranges referenced by in-flight AI Review are visually locked — `inFlightAnchors` state consumed by UI to disable editing on those ranges
- [ ] **UI-05**: Have a Look button is disabled while an AI job is in progress (prevent double-trigger)

### Cleanup

- [ ] **CLN-01**: Remove dead code `AiReviewButton.vue` (superseded by `Toolbar.vue`)
- [ ] **CLN-02**: Verify all 3 personas (Friendly, Critical, Improvement) produce distinct, appropriate comment styles

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Rewrite & Suggestions

- **RW-01**: Suggestion cards appear in sidebar with accept/reject actions
- **RW-02**: Accepted suggestions apply text changes with authorship trace

### Memory

- **MEM-01**: `save_memory` tool implemented in toolRegistry.js
- **MEM-02**: Writer memory persisted to `~/.flowrite/writer-memory.json`

### Version History

- **VH-01**: Auto-save on timer
- **VH-02**: Git tree-based version history with diff viewer

## Out of Scope

| Feature | Reason |
|---------|--------|
| Voice Flow mode | M6 — requires Whisper integration, slash-command framework |
| CLI tools | M4 — external agent integration, separate milestone |
| Cross-file context | Deferred to avoid Obsidian scope creep (April 11 decision) |
| Always-on ambient review | V2+ — interruption/timing UX unsolved |
| `save_memory` tool | M5 — Memory system is a separate milestone |
| `propose_suggestion` UI surface | M2 — SuggestionCard.vue exists but unmounted; separate milestone |
| Vue 3 migration | Ocean-scale effort, not related to feature work |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AI-01 | — | Pending |
| AI-02 | — | Pending |
| AI-03 | — | Pending |
| AI-04 | — | Pending |
| AI-05 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| CLN-01 | — | Pending |
| CLN-02 | — | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after initial definition*

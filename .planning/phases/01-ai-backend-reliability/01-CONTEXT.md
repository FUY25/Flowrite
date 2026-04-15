# Phase 1: AI Backend Reliability - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix token limits, error handling, persona routing, and session history so AI Review produces complete multi-comment responses for all three personas without truncation or silent failure. The existing AI pipeline is wired end-to-end; this phase is reliability hardening, not greenfield work.

</domain>

<decisions>
## Implementation Decisions

### Token Limits
- **D-01:** Use per-job-type `max_tokens` limits — not a uniform cap across all job types
- **D-02:** AI Review (`JOB_TYPE_AI_REVIEW`) gets `max_tokens: 16384` — the Sonnet 4.x model maximum. This eliminates truncation entirely for any realistic review. Research confirmed `max_tokens` is a cap, not a cost commitment; setting it to model max has zero cost impact since you only pay for tokens actually generated
- **D-03:** Thread replies (`JOB_TYPE_THREAD_REPLY`) and suggestion requests (`JOB_TYPE_REQUEST_SUGGESTION`) get `max_tokens: 2048` — sufficient for single-comment responses

### Partial Failure & Error Handling
- **D-04:** On failure (network error, API error), keep any partial comments already created — they are already persisted in the sidecar and should remain visible in the sidebar
- **D-05:** Surface errors via toast notification with an inline "Retry" button that re-triggers Have a Look with the same persona. This handles the only realistic failure modes (network/API errors) since truncation is eliminated by D-02

### Review Comment Behavior
- **D-06:** Remove the fixed "1 to 3 comments" constraint from the AI Review prompt. Instead, instruct the model to "leave comments on the most important issues" and let it decide naturally based on document content. This produces more organic, proportional feedback
- **D-07:** Prefer margin comments over global comments. Passage-specific feedback anchored to text is the star feature. Global comments should be used only for document-wide themes (structure, tone, thesis)
- **D-08:** Comment length/depth is Claude's discretion — may vary by persona and by what the comment addresses

### Persona Instructions
- **D-09:** Ship Phase 1 with the existing single-sentence persona instructions. Expanding to richer 3-5 sentence behavioral profiles is deferred to Phase 4 (Persona Voice Design). The current instructions are sufficient for verifying persona routing works correctly (AI-03)

### Claude's Discretion
- Comment length and detail level per persona (D-08)
- Exact comment distribution across margin vs global (within the "prefer margin" constraint of D-07)
- How many comments to produce per review (within the "no fixed limit" decision of D-06)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI Runtime Layer
- `flowrite-marktext/src/main/flowrite/ai/promptBuilder.js` — Where `max_tokens` default (line 191), `REVIEW_PERSONA_INSTRUCTIONS` (lines 22-26), `buildRuntimeRequest()`, and `trimConversationHistory()` live. Primary file for D-01 through D-03, D-06, D-09
- `flowrite-marktext/src/main/flowrite/ai/runtimeManager.js` — `runJob()` method (line 56) loads conversation history, builds request, and persists updated history after completion. Relevant for AI-04
- `flowrite-marktext/src/main/flowrite/ai/runtimeWorker.js` — The agentic loop (`buildRuntimeWorkerSource()`). Where truncation and malformed responses would surface. Relevant for AI-05, D-04
- `flowrite-marktext/src/main/flowrite/ai/toolRegistry.js` — `TOOL_SETS` and `getFlowriteTools()` control which tools each job type can use. AI Review uses only `create_comment`
- `flowrite-marktext/src/main/flowrite/ai/collaborationRouting.js` — `resolveNextThreadMode()` for collaboration mode routing

### Controller
- `flowrite-marktext/src/main/flowrite/controller.js` — `runAiReview()` (line 437), `_runWithProgress()` (line 179), `buildAiReviewPrompt()` (line 264). Orchestrates the review job and sends progress/error events

### Sidecar Persistence
- `flowrite-marktext/src/main/flowrite/files/documentStore.js` — `loadDocumentRecord()` and `saveDocumentRecord()` for conversation history persistence (AI-04)
- `flowrite-marktext/src/main/flowrite/files/commentsStore.js` — Where partial comments persist during review (D-04)

### Shared Constants
- `flowrite-marktext/src/flowrite/constants.js` — All status codes, job types, persona constants, scope constants

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Full architecture documentation including data flow diagrams
- `.planning/codebase/CONCERNS.md` — Known issues including max_tokens cap, dual worker code paths, token estimation heuristic

### Requirements
- `.planning/REQUIREMENTS.md` — AI-01 through AI-05 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildRuntimeRequest()` in `promptBuilder.js` already accepts `maxTokens` parameter (line 191) — just needs per-job-type overrides passed in
- `REVIEW_PERSONA_INSTRUCTIONS` object already maps persona constants to instruction strings — routing is wired
- `trimConversationHistory()` handles history compaction at 80K tokens — conversation persistence pipeline is complete
- `sendRuntimeProgress()` in controller already pushes status updates to renderer — error progress events just need richer payloads
- `onProgress` callback in `runAiReview()` already fires after each `create_comment` tool call — incremental comment display works

### Established Patterns
- Error propagation: worker posts `{ eventType: 'failed' }` → RuntimeManager rejects → Controller catches and sends `RUNTIME_STATUS_FAILED` → Vuex stores error → components display
- Job configuration: `_runWithProgress()` accepts `jobConfig` (object or function) — per-job-type token limits can be passed here
- History persistence: `runJob()` loads history before job, appends entries after, saves back to document.json

### Integration Points
- `buildRuntimeRequest()` line 191: change `maxTokens = 1024` default or override per call site
- `buildAiReviewPrompt()` line 271: modify "1 to 3 comments" instruction
- Controller `runAiReview()`: pass `maxTokens` override in `jobConfig.payload`
- Vuex `SET_FLOWRITE_RUNTIME_PROGRESS`: error payload already has `{ code, message }` — retry action needs a new field or UI-side handling

</code_context>

<specifics>
## Specific Ideas

- Token limit research showed that `max_tokens` is purely a cap — the API charges only for tokens actually generated. Setting it to model max (16384 for Sonnet 4.x) eliminates truncation at zero cost. This was a key insight that simplified the error handling design.
- The retry button on error toast should re-trigger Have a Look with the same persona the user originally selected. The `reviewPersona` is already available in the Vuex runtime state.

</specifics>

<deferred>
## Deferred Ideas

- **Persona Voice Design** — Expanding persona instructions from single sentences to rich 3-5 sentence behavioral profiles. Added as Phase 4 in the roadmap.
- **Streaming progress** — Switch from `messages.create()` to `messages.stream()` for real-time token-by-token feedback. Not in Phase 1 scope (noted in CONCERNS.md as a missing feature).
- **Token estimation improvement** — Replace char/4 heuristic with actual `usage.input_tokens` from API responses. Noted in CONCERNS.md but not blocking Phase 1.

</deferred>

---

*Phase: 01-ai-backend-reliability*
*Context gathered: 2026-04-15*

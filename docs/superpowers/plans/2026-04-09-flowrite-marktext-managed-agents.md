# Flowrite On MarkText With Claude Messages API + Tool Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the MarkText fork into Flowrite, a markdown-first thinking editor where Claude comments in context, proposes rewrites only as suggestions, and remembers enough document and writer context to feel like a real writing companion.

**Architecture:** Keep MarkText and Muya as the editing core, add a Flowrite layer in the Electron main process and renderer, and run Anthropic Messages API orchestration inside a dedicated Node `worker_thread`. Plain markdown remains canonical, `.flowrite/` sidecars store document metadata, and the worker uses local tool calls executed by the main process to create comments and propose suggestions.

**Tech Stack:** Electron, Vue 2, Vuex, Muya, Node.js `worker_threads`, `@anthropic-ai/sdk`, Anthropic Messages API with tool use and prompt caching, sidecar JSON storage, Playwright, Karma/Mocha unit tests

---

## Summary

Flowrite V1 now has three interaction modes:

1. `AI Review` button, document-wide proactive review with persona selection
2. `User margin comment`, selection-based thread with AI response
3. `User global comment`, document-level thread below the editor

All three modes use the same backend runtime:

- one local conversation session per article
- Anthropic Messages API, not Managed Agents
- structured tool use instead of free-text parsing
- worker-thread orchestration so the Electron main process stays responsive
- sidecar metadata, offline fallback, and suggestion safety snapshots

UI direction for V1 is intentionally restrained:

- inherit MarkText's existing editor chrome, visual rhythm, and overall calm by default
- make new Flowrite surfaces feel native to MarkText first, not like an appended AI product
- when MarkText has no existing pattern, use a clear minimalistic Notion-like treatment for new controls, cards, drawers, and popovers
- margin comments should specifically borrow the feel of Notion's margin discussions: quiet right-side cards, subtle borders, light connector lines, compact avatar plus timestamp metadata, and stacked thread replies that feel attached to the text rather than floating as a chat sidebar

## What Already Exists

- MarkText already provides the desktop shell, file open/save flow, preferences, and Electron process split.
- Muya already provides selection tracking, paragraph IDs, overlays, and the realtime markdown editing surface.
- MarkText `dataCenter` already stores user settings securely enough to extend for API-key configuration.
- MarkText renderer state already tracks the current document lifecycle, so Flowrite should attach to that flow instead of inventing a parallel document model.

## Step 0 Scope Decision

This plan is intentionally reduced to the first shippable slice:

- keep: sidecars, worker runtime, API-key flow, global comments, margin comments, AI Review, suggestion accept/reject
- defer: version-history drawer, writer memory, prompt compaction, multi-document context tools, and visible provenance styling

This keeps the first implementation focused on the core product wedge: AI comments living naturally inside the writing experience.

## Important Interface Changes

### New main-process IPC surface

All Flowrite channels use `mt::flowrite:` prefix:

```text
mt::flowrite:bootstrap-document
mt::flowrite:run-ai-review
mt::flowrite:submit-global-comment
mt::flowrite:submit-margin-comment
mt::flowrite:request-suggestion
mt::flowrite:accept-suggestion
mt::flowrite:reject-suggestion
mt::flowrite:update-settings
mt::flowrite:test-api-key
```

### New worker protocol

The worker only owns Anthropic conversation orchestration. It does not mutate app state directly.

```js
// main -> worker
{
  requestId,
  jobType: 'bootstrap' | 'ai_review' | 'thread_reply' | 'request_suggestion',
  documentPath,
  payload
}

// worker -> main
{
  requestId,
  eventType: 'tool_call' | 'stream_delta' | 'completed' | 'failed' | 'progress',
  payload
}
```

### Tool contract

Claude uses structured tool calls only:

- `create_comment`
- `propose_suggestion`

No free-text response is allowed to create app state. All persisted comment and suggestion state must come through tools.

## Core Data Contracts

### Document sidecar layout

```text
<doc-dir>/<doc-name>.md
<doc-dir>/.flowrite/
  <document-slug>-<path-hash>/
    document.json
    comments.json
    suggestions.json
    snapshots/
```

### `document.json`

```json
{
  "schemaVersion": 1,
  "documentId": "uuid",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "conversationHistory": [],
  "historyTokenEstimate": 0,
  "responseStyle": "comment_only",
  "lastReviewPersona": "improvement"
}
```

### `comments.json`

```json
{
  "schemaVersion": 1,
  "threads": [
    {
      "id": "thr_123",
      "scope": "global",
      "status": "open",
      "messages": [
        {
          "id": "msg_123",
          "author": "user",
          "mode": "global_comment",
          "body": "What is weak here?",
          "createdAt": "ISO8601"
        },
        {
          "id": "msg_124",
          "author": "ai",
          "mode": "global_comment",
          "body": "The middle section jumps too quickly from observation to conclusion.",
          "createdAt": "ISO8601"
        }
      ]
    }
  ]
}
```

### Margin anchor

```json
{
  "paragraphId": "ag-123",
  "startOffset": 18,
  "endOffset": 61,
  "quote": "Sometimes the paragraph sounds certain before the reasoning is actually there."
}
```

### `suggestions.json`

```json
{
  "schemaVersion": 1,
  "suggestions": [
    {
      "id": "sg_123",
      "threadId": "thr_123",
      "anchor": {
        "paragraphId": "ag-123",
        "startOffset": 18,
        "endOffset": 61,
        "quote": "old text"
      },
      "replacement": "new text",
      "reasoning": "This clarifies the causal link.",
      "status": "pending",
      "provenance": {
        "provider": "anthropic-messages-api",
        "requestId": "req_123",
        "bufferAppliedAt": null,
        "acceptedAt": null
      }
    }
  ]
}
```

## Data Flow

### Request path

```text
Renderer UI
   |
   v
Vuex Flowrite module
   |
   v
Electron IPC (mt::flowrite:*)
   |
   v
Main-process Flowrite controller
   |
   +--> Sidecar store / snapshot store / preferences
   |
   v
Worker thread runtime
   |
   v
Anthropic Messages API
   |
   v
Tool calls emitted back to main process
   |
   +--> create_comment / propose_suggestion
   |
   v
Sidecar state updated
   |
   v
Renderer refresh + stream/progress updates
```

### Suggestion acceptance path

```text
Pending suggestion card
   |
Accept
   |
   v
Validate current anchor quote
   |
   +--> exact match -> proceed
   +--> fuzzy match -> re-anchor then proceed
   +--> no safe match -> block, mark outdated
   |
   v
Create snapshot
   |
   v
Patch markdown in Muya
   |
   v
Persist `applied_in_buffer` metadata
   |
   v
Finalize as `accepted` after successful markdown save
```

## NOT in Scope

- Human collaboration, shared comments, or multi-user presence. Single writer only.
- Managed Agents, cloud containers, or remote long-running agent state.
- Writer memory and memory management UI.
- Version-history drawer and full restore UI.
- Prompt compaction for very long sessions.
- Multi-document context tools or project-wide search handoff to Claude.
- Visible provenance styling or hover UI for accepted AI edits.
- Vue 3 migration.
- Autonomous always-on commenting while typing.
- Provider abstraction for multiple LLM vendors. Build Anthropic correctly first.

## Implementation Tasks

### Task 1: Re-baseline the fork and remove stale Managed Agents assumptions

**Files:**
- Modify: `vendor/marktext/package.json`
- Modify: `vendor/marktext/README.md`
- Test: `vendor/marktext/test/e2e/launch.spec.js`

- [ ] Add Anthropic SDK dependency and remove any plan references in repo docs that still tell implementers to use Managed Agents.
- [ ] Confirm the MarkText fork still boots before Flowrite code is added.
- [ ] Record the local developer commands for `dev`, `unit`, and `e2e` using the vendored MarkText app.
- [ ] Run `npm --prefix vendor/marktext run e2e -- test/e2e/launch.spec.js` and keep the baseline passing.
- [ ] Commit with message: `chore: baseline marktext fork for flowrite`

### Task 2: Add sidecar storage and safety snapshots

**Files:**
- Create: `vendor/marktext/src/main/flowrite/files/sidecarPaths.js`
- Create: `vendor/marktext/src/main/flowrite/files/documentStore.js`
- Create: `vendor/marktext/src/main/flowrite/files/commentsStore.js`
- Create: `vendor/marktext/src/main/flowrite/files/suggestionsStore.js`
- Create: `vendor/marktext/src/main/flowrite/files/snapshotStore.js`
- Modify: `vendor/marktext/src/main/filesystem/markdown.js`
- Modify: `vendor/marktext/src/main/menu/actions/file.js`
- Test: `vendor/marktext/test/unit/flowrite/storage.spec.js`

- [ ] Write failing unit tests for sidecar path derivation, corrupt JSON recovery, per-save-cycle snapshot creation, rename/move sidecar migration, and atomic markdown-plus-sidecar save behavior.
- [ ] Implement sidecar stores so plain markdown remains canonical and all Flowrite metadata lives under `.flowrite/`.
- [ ] Namespace sidecars per document inside `.flowrite/<document-slug>-<path-hash>/...` so multiple markdown files in one directory cannot collide.
- [ ] When a file is renamed or moved through MarkText, migrate its sidecar directory in the same operation. If the file was moved externally, allow a fresh namespace to be created on next open.
- [ ] Extend save flow so markdown save and sidecar save happen in one logical transaction, with error surfacing if sidecar persistence fails.
- [ ] Add snapshot creation helpers used before the first accepted AI suggestion in each dirty-save cycle. Do not build restore UI in this slice, and do not eagerly load snapshots on document bootstrap.
- [ ] Run `npm --prefix vendor/marktext run unit -- --grep "flowrite storage"` and require passing tests before moving on.
- [ ] Commit with message: `feat: add flowrite sidecar storage and snapshots`

### Task 3: Build the worker-thread Claude runtime on top of Messages API

**Files:**
- Create: `vendor/marktext/src/main/flowrite/ai/runtimeWorker.js`
- Create: `vendor/marktext/src/main/flowrite/ai/runtimeManager.js`
- Create: `vendor/marktext/src/main/flowrite/ai/anthropicClient.js`
- Create: `vendor/marktext/src/main/flowrite/ai/promptBuilder.js`
- Create: `vendor/marktext/src/main/flowrite/ai/toolRegistry.js`
- Create: `vendor/marktext/test/evals/flowrite-smoke.spec.js`
- Create: `vendor/marktext/test/evals/fixtures/`
- Test: `vendor/marktext/test/unit/flowrite/ai-runtime.spec.js`

- [ ] Write failing tests for worker boot, request/response correlation, tool-call loop, prompt-caching headers, offline failure handling, and history-cap trimming.
- [ ] Implement a single worker manager in the main process. One worker is enough for V1. It can queue document jobs instead of spawning one worker per thread.
- [ ] Inside the worker, call `@anthropic-ai/sdk` Messages API with:
  - system prompt for comment-first behavior
  - prompt caching on stable document/context blocks
  - structured tools for comment creation and suggestion proposal
- [ ] Persist one conversation history per article in `document.json`, not one history per thread.
- [ ] Track a rough token estimate per document and trim oldest conversation turns once the V1 budget is exceeded. Surface a renderer notice when older AI context has been dropped.
- [ ] Make tool execution round-trip through the main process so persistence remains centralized and renderer state stays derived from sidecars.
- [ ] Add opt-in live smoke evals guarded by `ANTHROPIC_API_KEY` for a few canned markdown fixtures, verifying comment-first behavior, persona differences, and valid structured tool usage.
- [ ] Run `npm --prefix vendor/marktext run unit -- --grep "flowrite ai runtime"` and require passing tests.
- [ ] Commit with message: `feat: add flowrite messages api worker runtime`

### Task 4: Add secure settings, API-key validation, and offline degradation

**Files:**
- Modify: `vendor/marktext/src/main/dataCenter/schema.json`
- Modify: `vendor/marktext/src/main/dataCenter/index.js`
- Create: `vendor/marktext/src/main/flowrite/settings/flowriteSettings.js`
- Create: `vendor/marktext/src/main/flowrite/network/status.js`
- Test: `vendor/marktext/test/unit/flowrite/settings.spec.js`

- [ ] Write failing tests for encrypted API-key persistence, key validation request, network-unavailable status, and disabled-AI fallback state.
- [ ] Store Anthropic API keys with Electron `safeStorage`, never in sidecar metadata.
- [ ] Add a first-run check and a runtime `test-api-key` path so the renderer can validate before enabling AI features.
- [ ] Expose online/offline and configured/unconfigured status to the renderer so the editor still works fully when AI is unavailable.
- [ ] Run `npm --prefix vendor/marktext run unit -- --grep "flowrite settings|flowrite network"` and require passing tests.
- [ ] Commit with message: `feat: add flowrite settings and offline gating`

### Task 5: Wire Flowrite state into the renderer document lifecycle

**Files:**
- Create: `vendor/marktext/src/renderer/store/modules/flowrite.js`
- Modify: `vendor/marktext/src/renderer/store/index.js`
- Modify: `vendor/marktext/src/renderer/store/editor.js`
- Test: `vendor/marktext/test/unit/flowrite/renderer-store.spec.js`

- [ ] Write failing renderer-store tests for document bootstrap, sidecar load on file switch, runtime progress updates, and optimistic thread refresh after tool-driven state updates.
- [ ] Add a single bootstrap action that loads document sidecars, online/offline state, and runtime readiness whenever the current markdown file changes.
- [ ] Keep Flowrite state in one Vuex module for this slice, but drive it from the same file lifecycle as MarkText editor state so there is no second document model.
- [ ] Add a renderer-visible `inFlightAnchors` state for temporary text locking while an AI job references a range.
- [ ] Run `npm --prefix vendor/marktext run unit -- --grep "flowrite renderer store"` and require passing tests.
- [ ] Commit with message: `feat: add flowrite renderer state modules`

### Task 6: Add global comments and inline user comment entry below the article

**Files:**
- Create: `vendor/marktext/src/renderer/components/flowrite/GlobalComments.vue`
- Modify: `vendor/marktext/src/renderer/components/editorWithTabs/index.vue`
- Test: `vendor/marktext/test/e2e/flowrite-global-comments.spec.js`

- [ ] Write a failing e2e test that opens a markdown file, submits a user global comment in the bottom discussion area, streams an AI reply, and persists the thread after reload.
- [ ] Render one bottom discussion section below the editor, not a separate chat panel and not a standalone composer subsystem.
- [ ] Keep the input inline with the thread list so the interaction remains comment-native.
- [ ] Match existing MarkText typography, spacing, borders, and surface treatments first. If a new comment affordance needs fresh styling, keep it minimal and Notion-like instead of inventing a second visual system.
- [ ] Route submit through `mt::flowrite:submit-global-comment` and refresh from persisted sidecar state after the tool loop completes.
- [ ] Run `npm --prefix vendor/marktext run e2e -- test/e2e/flowrite-global-comments.spec.js`.
- [ ] Commit with message: `feat: add global comment threads`

### Task 7: Add selection-based margin comments and anchor rebasing

**Files:**
- Create: `vendor/marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
- Create: `vendor/marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- Create: `vendor/marktext/src/renderer/components/flowrite/MarginThreadPopover.vue`
- Modify: `vendor/marktext/src/renderer/components/editorWithTabs/editor.vue`
- Modify: `vendor/marktext/src/muya/lib/index.js`
- Modify: `vendor/marktext/src/muya/lib/selection/index.js`
- Test: `vendor/marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] Write a failing e2e test for selecting a passage, submitting a user margin comment, receiving an AI reply in-thread, editing nearby text, and keeping the thread attached or visibly detached.
- [ ] Reuse Muya paragraph IDs and offsets as the primary anchor, and always store the selected quote for later rebasing.
- [ ] Add fuzzy reattachment for changed passages, and mark a thread `detached` if no safe match is found.
- [ ] Keep margin affordances visually quiet. Reuse MarkText overlay conventions where possible, but make the thread presentation explicitly resemble Notion-style margin comments: right-margin anchored cards, soft borders, compact metadata row, visible reply nesting/connector line, and a calm paper-like surface rather than a chat bubble treatment.
- [ ] Preserve document primacy while using this Notion-like comment style. The margin thread should read as an attached annotation system, not a persistent side chat panel or collaboration inbox.
- [ ] Block suggestion application when the quote no longer matches and rebasing fails.
- [ ] Run `npm --prefix vendor/marktext run e2e -- test/e2e/flowrite-margin-comments.spec.js`.
- [ ] Commit with message: `feat: add margin comment threads and anchor rebasing`

### Task 8: Add AI Review mode with friendly, critical, and improvement personas

**Files:**
- Create: `vendor/marktext/src/renderer/components/flowrite/AiReviewButton.vue`
- Modify: `vendor/marktext/src/renderer/components/editorWithTabs/index.vue`
- Modify: `vendor/marktext/src/main/flowrite/ai/promptBuilder.js`
- Test: `vendor/marktext/test/e2e/flowrite-ai-review.spec.js`
- Test: `vendor/marktext/test/unit/flowrite/ai-review-prompts.spec.js`

- [ ] Write failing tests for:
  - persona prompt selection
  - progress state during review
  - multiple comments created from one review run
  - no free-text side effects outside comment tools
- [ ] Add an `AI Review` control with persona choice: `friendly`, `critical`, `improvement`.
- [ ] Implement review jobs as document-wide runs that create multiple comment threads through repeated `create_comment` tool calls.
- [ ] Stream progress back to the renderer so long review runs feel alive, not frozen.
- [ ] Run:
  - `npm --prefix vendor/marktext run unit -- --grep "flowrite ai review"`
  - `npm --prefix vendor/marktext run e2e -- test/e2e/flowrite-ai-review.spec.js`
- [ ] Commit with message: `feat: add ai review mode`

### Task 9: Add suggestion flow and restore-safe acceptance

**Files:**
- Create: `vendor/marktext/src/renderer/components/flowrite/SuggestionCard.vue`
- Modify: `vendor/marktext/src/renderer/components/flowrite/MarginThreadPopover.vue`
- Test: `vendor/marktext/test/e2e/flowrite-suggestions.spec.js`

- [ ] Write failing e2e and integration tests for request-suggestion, accept, reject, anchor validation before apply, per-save-cycle snapshot creation, finalization after markdown save, and reopen-after-interrupted-save recovery from `applied_in_buffer`.
- [ ] Keep every rewrite as a pending suggestion until explicit accept.
- [ ] On accept:
  - validate exact quote match
  - attempt fuzzy re-anchor if needed
  - abort safely if still stale
  - create one safety snapshot only if the current dirty-save cycle has not already been snapshotted
  - apply patch in the open editor buffer
  - persist `applied_in_buffer` metadata immediately
  - finalize `accepted` only after the next successful markdown save
  - roll back to pending or recover cleanly if the app reopens before the save completes
- [ ] Run `npm --prefix vendor/marktext run e2e -- test/e2e/flowrite-suggestions.spec.js`.
- [ ] Commit with message: `feat: add ai suggestions`

## Test Plan

### Unit tests

- sidecar path derivation, per-document namespacing, and per-save-cycle snapshot creation
- corrupt JSON recovery and backup rename behavior
- atomic save orchestration
- worker request lifecycle and tool loop
- prompt caching header injection
- history-cap trimming and dropped-context notice behavior
- secure API-key persistence and validation
- renderer bootstrap on file switch
- AI Review persona prompt generation
- suggestion snapshot creation before the first accepted AI edit in a dirty-save cycle
- deterministic prompt/tool-shape fixture coverage

### Integration tests

- IPC request from renderer to main to worker and back
- snapshot-before-first-accept-in-save-cycle flow
- buffered suggestion acceptance -> save finalization flow
- interrupted-save reopen recovery for `applied_in_buffer`
- offline state disabling AI while preserving local editing

### LLM evals

- opt-in smoke evals on canned markdown documents
- verify comment-first behavior before rewrite suggestion
- verify AI Review persona deltas: `friendly`, `critical`, `improvement`
- verify tool calls stay inside the allowed structured contract

### End-to-end tests

- app launch baseline
- global comment thread create -> AI reply -> reload persistence
- margin comment create -> AI reply -> anchor drift -> detached indicator
- AI Review with persona selection and multiple AI-created comments
- request suggestion -> reject leaves markdown unchanged
- request suggestion -> accept snapshots and patches text safely
- invalid API key / offline AI disabled state
- rename or move a markdown file inside MarkText and keep the same Flowrite sidecar state

### Critical failure modes to test explicitly

```text
Comment submit
  -> network down
  -> worker crash
  -> Anthropic timeout

Suggestion accept
  -> stale anchor
  -> fuzzy reattach success
  -> fuzzy reattach failure

Sidecar load
  -> missing files
  -> corrupt JSON
  -> partial sidecar write failure

File lifecycle
  -> rename inside MarkText
  -> move inside MarkText
  -> reopen after interrupted save with `applied_in_buffer`
```

## Assumptions And Defaults

- Anthropic is the only LLM provider in V1.
- One worker thread is enough for V1. Queue jobs instead of parallelizing multiple model workers.
- One conversation history exists per article, not per comment thread.
- Prompt caching is used only for stable system/document blocks, not mutable conversation turns.
- The renderer shows disabled AI states instead of hiding AI features when offline or unconfigured.
- AI Review persona is selected per run. Response style remains a document-level default.
- `GlobalComments.vue` contains inline comment input. No standalone `GlobalComposer.vue`.
- Sidecar schema version starts at `1`.
- Sidecar namespace is per document, using a readable slug plus a path hash.
- Snapshot files exist for safety before suggestion acceptance, but there is no user-facing restore drawer in this slice.
- Accepted suggestions become `applied_in_buffer` first and are only finalized after a successful markdown save.
- Flowrite inherits MarkText styling by default. Any net-new UI should stay sparse and minimal, using a Notion-like pattern only where MarkText has no clear existing analogue.
- Margin comments are the clearest exception: they should intentionally target a Notion-style annotation feel, adapted to MarkText's calmer editor chrome.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES_OPEN | Prior CEO review expanded and corrected the plan. Its key decisions, Messages API, AI Review, deferred memory UI, and resolved edge cases, are now incorporated into this reduced first-slice plan. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | Scope reduced to the core wedge. Added per-document sidecar namespacing, V1 history cap with trim notice, buffered suggestion finalization after save, single Vuex module, lightweight LLM evals, and per-save-cycle snapshots. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready for design review or implementation planning.

# Codebase Structure

**Analysis Date:** 2026-04-15

## Directory Layout

```
flowrite-marktext/
├── src/
│   ├── flowrite/                    # Shared Flowrite utilities (no Electron, no Vue)
│   │   ├── constants.js             # All status codes, enums, well-known IDs
│   │   ├── anchors/
│   │   │   └── index.js             # Anchor creation + fuzzy resolution engine
│   │   └── suggestions/
│   │       └── index.js             # Suggestion target resolution against markdown
│   │
│   ├── main/
│   │   ├── dataCenter/
│   │   │   └── index.js             # IPC handler registration (mt::flowrite:* at lines 254–316)
│   │   └── flowrite/                # All Flowrite main-process code
│   │       ├── controller.js        # FlowriteController — orchestrates all jobs
│   │       ├── ai/
│   │       │   ├── runtimeManager.js        # Worker lifecycle + request queue
│   │       │   ├── runtimeWorker.js         # worker_thread source + inline fallback
│   │       │   ├── promptBuilder.js         # System prompt, turn assembly, history trim
│   │       │   ├── toolRegistry.js          # Tool definitions + per-job-type tool sets
│   │       │   ├── anthropicClient.js       # Anthropic SDK factory, web API shims
│   │       │   ├── collaborationRouting.js  # comment_only vs cowriting mode logic
│   │       │   └── commentGuardrails.js     # Comment body validation/rejection rules
│   │       ├── files/
│   │       │   ├── sidecarPaths.js          # Sidecar directory path derivation
│   │       │   ├── documentStore.js         # document.json read/write + history
│   │       │   ├── commentsStore.js         # comments.json read/write + thread append
│   │       │   ├── suggestionsStore.js      # suggestions.json read/write
│   │       │   ├── snapshotStore.js         # Pre-accept snapshot creation
│   │       │   └── status.js                # File-layer status helpers
│   │       ├── network/
│   │       │   └── status.js                # Online check + network error normalization
│   │       └── settings/
│   │           └── flowriteSettings.js      # FlowriteSettings — API key, model, collab mode
│   │
│   ├── renderer/
│   │   ├── components/flowrite/     # All Flowrite Vue components
│   │   │   ├── Toolbar.vue                  # Top bar: sidebar toggle, annotations toggle, Have a Look
│   │   │   ├── HaveALookPopover.vue         # Persona selector + optional prompt textarea
│   │   │   ├── GlobalComments.vue           # Bottom discussion panel (global thread)
│   │   │   ├── MarginCommentLayer.vue       # Absolute-positioned margin thread rail
│   │   │   ├── MarginThreadCard.vue         # Single margin thread card (read + reply)
│   │   │   ├── MarginThreadComposer.vue     # New margin comment composer card
│   │   │   ├── MarginAnchorHighlights.vue   # DOM highlight overlays for anchored text
│   │   │   ├── MarginCommentDots.vue        # Gutter dot indicators per paragraph
│   │   │   ├── SuggestionCard.vue           # Rewrite suggestion with Accept/Reject buttons
│   │   │   └── marginLayout.js              # Pure layout: compute top positions with gap+compression
│   │   └── store/modules/
│   │       └── flowrite.js          # Vuex module: state, mutations, actions, lifecycle registration
│   │
│   └── muya/lib/ui/
│       └── flowriteSelectionMenu/   # Muya plugin: "Ask Flowrite" popup on text selection
│           ├── index.js
│           └── index.css
│
├── test/unit/specs/flowrite/        # Unit tests for Flowrite (if present)
└── test/e2e/specs/                  # Playwright e2e tests
```

## Directory Purposes

**`src/flowrite/`:**
- Purpose: Pure shared logic importable by both renderer and main process without any runtime coupling
- Contains: Constants, anchor resolution algorithm, suggestion text matching
- Key files: `flowrite-marktext/src/flowrite/constants.js`, `flowrite-marktext/src/flowrite/anchors/index.js`

**`src/main/flowrite/`:**
- Purpose: Everything Flowrite-specific that runs in the Electron main process
- Contains: Controller, AI runtime, file I/O, settings, network checks
- Key files: `flowrite-marktext/src/main/flowrite/controller.js`

**`src/main/flowrite/ai/`:**
- Purpose: The AI layer — worker management, Anthropic API calls, prompt assembly
- Contains: `runtimeManager.js` (orchestrates), `runtimeWorker.js` (the actual API loop), `promptBuilder.js` (message formatting)
- Key files: `flowrite-marktext/src/main/flowrite/ai/runtimeManager.js`, `flowrite-marktext/src/main/flowrite/ai/runtimeWorker.js`

**`src/main/flowrite/files/`:**
- Purpose: All sidecar file I/O — reading/writing `document.json`, `comments.json`, `suggestions.json`
- Contains: One store module per sidecar file type plus shared path utilities
- Key files: `flowrite-marktext/src/main/flowrite/files/sidecarPaths.js`, `flowrite-marktext/src/main/flowrite/files/commentsStore.js`

**`src/renderer/components/flowrite/`:**
- Purpose: All Flowrite Vue UI components
- Contains: 9 Vue single-file components + 1 JS layout utility
- Key files: `flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`, `flowrite-marktext/src/renderer/components/flowrite/GlobalComments.vue`

**`src/renderer/store/modules/flowrite.js`:**
- Purpose: Single Vuex module for all Flowrite state; also the renderer-side lifecycle entry point
- Key exports: default module, `registerFlowriteLifecycle(store)`, `createDefaultFlowriteState()`

**`src/muya/lib/ui/flowriteSelectionMenu/`:**
- Purpose: Muya plugin that hooks into the editor's selection events to surface the "Ask Flowrite" button
- Key file: `flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`

## Key File Locations

**Entry Points:**
- `flowrite-marktext/src/main/dataCenter/index.js`: IPC handler registration; Flowrite controllers instantiated in `DataCenter` constructor
- `flowrite-marktext/src/renderer/store/modules/flowrite.js`: `registerFlowriteLifecycle(store)` wires up all renderer lifecycle watchers

**Configuration:**
- `flowrite-marktext/src/main/flowrite/settings/flowriteSettings.js`: API key, model URL, collaboration mode
- `flowrite-marktext/src/main/flowrite/ai/anthropicClient.js`: `DEFAULT_FLOWRITE_MODEL`, `DEFAULT_FLOWRITE_AI_BASE_URL`, web API shim setup

**Core Logic:**
- `flowrite-marktext/src/main/flowrite/controller.js`: All AI job orchestration + prompt building
- `flowrite-marktext/src/main/flowrite/ai/runtimeManager.js`: Worker lifecycle + tool-call relay
- `flowrite-marktext/src/main/flowrite/ai/runtimeWorker.js`: Anthropic agentic loop (inline worker source string)
- `flowrite-marktext/src/main/flowrite/ai/promptBuilder.js`: System prompt, request assembly, conversation history trimming
- `flowrite-marktext/src/flowrite/anchors/index.js`: Anchor creation + fuzzy re-attachment resolution
- `flowrite-marktext/src/main/flowrite/files/sidecarPaths.js`: Sidecar directory derivation

**IPC Channel Inventory (all in `dataCenter/index.js`):**
- `mt::flowrite:bootstrap-document` — load sidecar data on document open
- `mt::flowrite:submit-global-comment` — user sends global discussion message
- `mt::flowrite:submit-margin-comment` — user sends margin thread message
- `mt::flowrite:delete-thread` — delete a margin thread
- `mt::flowrite:run-ai-review` — Have a Look trigger
- `mt::flowrite:request-suggestion` — request a rewrite suggestion
- `mt::flowrite:accept-suggestion` — accept a pending suggestion
- `mt::flowrite:reject-suggestion` — reject a pending suggestion
- `mt::flowrite:finalize-suggestions-after-save` — confirm buffer-applied suggestions after Cmd+S
- `mt::flowrite:update-settings` — update AI settings (API key, model, etc.)
- `mt::flowrite:test-api-key` — validate an API key

**IPC Push Channels (main → renderer):**
- `mt::flowrite:runtime-progress` — AI job status updates (running/completed/failed + message)
- `mt::flowrite:tool-state-updated` — fresh sidecar state after each tool call

## Naming Conventions

**Files:**
- Flowrite Vue components: `PascalCase.vue` (e.g., `MarginThreadCard.vue`, `GlobalComments.vue`)
- Flowrite JS modules in main: `camelCase.js` (e.g., `runtimeManager.js`, `commentsStore.js`)
- Shared utilities: `camelCase.js` with `index.js` barrel (e.g., `src/flowrite/anchors/index.js`)

**Directories:**
- Main process Flowrite: `src/main/flowrite/<area>/` where area is `ai/`, `files/`, `network/`, `settings/`
- Renderer Flowrite components: `src/renderer/components/flowrite/`
- Muya Flowrite plugins: `src/muya/lib/ui/flowrite<PluginName>/`

**Classes:**
- Main-process service classes: `Flowrite<Name>` prefix (e.g., `FlowriteController`, `FlowriteRuntimeManager`, `FlowriteSettings`)

**IPC Channels:**
- Pattern: `mt::flowrite:<verb>-<noun>` (e.g., `mt::flowrite:submit-global-comment`, `mt::flowrite:run-ai-review`)

**Vuex:**
- Mutations: `SCREAMING_SNAKE_CASE` with `FLOWRITE_` prefix for Flowrite-specific ones (e.g., `APPLY_FLOWRITE_BOOTSTRAP`, `SET_FLOWRITE_MARGIN_COMPOSER`)
- Actions: `SCREAMING_SNAKE_CASE` (e.g., `SUBMIT_GLOBAL_COMMENT`, `RUN_AI_REVIEW`)

**Constants:**
- All in `src/flowrite/constants.js`; grouped by category with inline comments
- Status enums: `SUGGESTION_STATUS_*`, `RUNTIME_STATUS_*`, `ANCHOR_*`
- Phase enums: `PHASE_*`
- Job types: `JOB_TYPE_*`

## Where to Add New Code

**New AI job type (e.g., a summarize job):**
- Add `JOB_TYPE_SUMMARIZE` constant: `flowrite-marktext/src/flowrite/constants.js`
- Add tool set entry in: `flowrite-marktext/src/main/flowrite/ai/toolRegistry.js`
- Add controller method `summarize(...)` in: `flowrite-marktext/src/main/flowrite/controller.js`
- Add IPC handler: `flowrite-marktext/src/main/dataCenter/index.js`
- Add Vuex action: `flowrite-marktext/src/renderer/store/modules/flowrite.js`

**New Vue UI component:**
- Implementation: `flowrite-marktext/src/renderer/components/flowrite/NewComponent.vue`
- Register in parent component (e.g., in `MarginCommentLayer.vue` or the editor shell)

**New sidecar data file:**
- Path derivation: extend `flowrite-marktext/src/main/flowrite/files/sidecarPaths.js`
- Add `<name>Store.js` in: `flowrite-marktext/src/main/flowrite/files/`

**New shared utility (usable in both renderer and main):**
- Add to: `flowrite-marktext/src/flowrite/` (never import Electron or Vue here)

**New Muya editor integration:**
- Add plugin directory: `flowrite-marktext/src/muya/lib/ui/flowrite<PluginName>/`
- Follow `FlowriteSelectionMenu` pattern: extend `BaseFloat`, subscribe to Muya `eventCenter`, dispatch named event for Vue layer to handle

## Special Directories

**`src/flowrite/` (shared):**
- Purpose: Pure logic shared between renderer and main process
- Generated: No
- Committed: Yes

**`<doc-dir>/.flowrite/<slug>-<hash>/` (runtime sidecar):**
- Purpose: Per-document metadata — conversation history, comments, suggestions, snapshots
- Generated: Yes, at runtime by `sidecarPaths.js`
- Committed: User decides (not in `.gitignore` by default); these are the writer's data

**`flowrite-marktext/src/muya/` (vendored):**
- Purpose: MarkText's embedded markdown editor engine; Flowrite adds one plugin directory here
- Generated: No
- Note: Treat as third-party; only modify files under `flowrite-marktext/src/muya/lib/ui/flowrite*/`

---

*Structure analysis: 2026-04-15*

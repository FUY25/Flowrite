# Architecture

**Analysis Date:** 2026-04-15

## Pattern Overview

**Overall:** Layered Electron application with a Flowrite feature layer grafted onto the MarkText base. Flowrite is structured as a clean vertical slice: Vue components (renderer) → Vuex store → IPC bridge → Controller (main process) → RuntimeManager → worker_thread → Anthropic API.

**Key Characteristics:**
- Flowrite code is fully separated from MarkText code in dedicated directories
- AI work runs in a Node.js `worker_thread` to avoid blocking the main process
- All state changes flow through Vuex; components never call IPC directly
- Sidecar files (`.flowrite/` directory) are the canonical persistence layer; Vuex is derived/cached state
- IPC channel prefix `mt::flowrite:` distinguishes Flowrite handlers from MarkText's `mt::` handlers

## Layers

**Shared Constants & Utilities:**
- Purpose: Types, status codes, and pure logic shared by both renderer and main process
- Location: `flowrite-marktext/src/flowrite/`
- Contains: `constants.js`, anchor resolution logic (`anchors/index.js`), suggestion resolution logic (`suggestions/index.js`)
- Depends on: nothing (no Electron, no Vue)
- Used by: both main process (`src/main/flowrite/`) and renderer (`src/renderer/`)

**Vue Component Layer:**
- Purpose: All Flowrite UI — toolbar, margin threads, global discussion, suggestion cards
- Location: `flowrite-marktext/src/renderer/components/flowrite/`
- Contains: 11 `.vue` files and 1 layout utility
- Depends on: Vuex store (`flowrite` module), `src/flowrite/` shared utilities
- Used by: MarkText editor shell (`editorWithTabs`)

**Vuex State Layer:**
- Purpose: Flowrite application state, IPC dispatch, lifecycle wiring
- Location: `flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Contains: one monolithic module with state, mutations, and actions
- Depends on: `ipcRenderer`, `src/flowrite/constants`, `src/flowrite/anchors`
- Used by: Vue components via `mapState` and `$store.dispatch`

**IPC Bridge (main process):**
- Purpose: Registers `ipcMain.handle` handlers for all `mt::flowrite:*` channels
- Location: `flowrite-marktext/src/main/dataCenter/index.js` (lines 254–316)
- Contains: 11 IPC handlers that delegate to `FlowriteController` or `FlowriteSettings`
- Depends on: `FlowriteController`, `FlowriteSettings`, Electron's `ipcMain`, `BrowserWindow`
- Used by: Electron main process startup (`DataCenter` constructor → `_listenForIpcMain()`)

**Controller (main process):**
- Purpose: Orchestrates all AI jobs and sidecar file mutations; the main-process "service layer"
- Location: `flowrite-marktext/src/main/flowrite/controller.js`
- Contains: `FlowriteController` class — methods for each job type, prompt building, tool execution, suggestion lifecycle
- Depends on: `FlowriteRuntimeManager`, `commentsStore`, `suggestionsStore`, `documentStore`, `snapshotStore`, `collaborationRouting`, `commentGuardrails`
- Used by: `DataCenter` (instantiated once per app lifetime)

**AI Runtime Layer:**
- Purpose: Manages the worker_thread lifecycle, job queuing, and bidirectional tool-call protocol
- Location: `flowrite-marktext/src/main/flowrite/ai/`
- Contains: `runtimeManager.js`, `runtimeWorker.js`, `promptBuilder.js`, `toolRegistry.js`, `anthropicClient.js`, `collaborationRouting.js`, `commentGuardrails.js`
- Depends on: `@anthropic-ai/sdk`, `undici`, `worker_threads`
- Used by: `FlowriteController` via `FlowriteRuntimeManager`

**Sidecar Persistence Layer:**
- Purpose: Read/write JSON sidecar files for all Flowrite document state
- Location: `flowrite-marktext/src/main/flowrite/files/`
- Contains: `documentStore.js`, `commentsStore.js`, `suggestionsStore.js`, `snapshotStore.js`, `sidecarPaths.js`, `status.js`
- Depends on: Node.js `fs`, `path`, `crypto`
- Used by: `FlowriteController`, `FlowriteRuntimeManager`

**Settings Layer:**
- Purpose: Stores API key (via Electron `safeStorage`), model config, collaboration mode; provides availability state
- Location: `flowrite-marktext/src/main/flowrite/settings/flowriteSettings.js`
- Contains: `FlowriteSettings` class
- Depends on: `electron-store`, Electron `safeStorage`
- Used by: `DataCenter` (instantiated once); `FlowriteController` queries it before every job

**Muya Integration:**
- Purpose: "Ask Flowrite" popup that appears on text selection inside the editor
- Location: `flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/`
- Contains: `FlowriteSelectionMenu` Muya plugin (`index.js`, `index.css`)
- Depends on: Muya `BaseFloat`, `selection`, `eventCenter`
- Used by: Muya event system; dispatches `flowrite-selection-comment` event that the Vue layer listens for

## Data Flow

**User Writes a Global Comment:**

1. User types in `GlobalComments.vue` input and presses Enter
2. `GlobalComments.vue` calls `this.$store.dispatch('SUBMIT_GLOBAL_COMMENT', body)`
3. Vuex action `SUBMIT_GLOBAL_COMMENT` calls `ipcRenderer.invoke('mt::flowrite:submit-global-comment', { pathname, markdown, body })`
4. `DataCenter._listenForIpcMain` handler delegates to `flowriteController.submitGlobalComment({ browserWindow, ... })`
5. `FlowriteController.submitGlobalComment` calls `appendCommentToThread` (persists user turn), then `_runWithProgress` → `runtimeManager.runJob`
6. `FlowriteRuntimeManager.runJob` builds a request via `promptBuilder.buildRuntimeRequest`, posts `run_job` to the worker
7. `worker_thread` (`runtimeWorker.js` inline source) calls `anthropic.messages.create` in a loop; on `tool_use` it posts `tool_call` back to the manager
8. `FlowriteRuntimeManager.handleWorkerMessage` calls `FlowriteController.executeToolCall` (e.g. `create_comment`) which writes to the sidecar
9. Manager posts `tool_result` back to the worker; worker completes and posts `completed`
10. `_runWithProgress` calls `sendPersistedRefresh` → pushes `mt::flowrite:tool-state-updated` to renderer
11. Vuex listener `APPLY_FLOWRITE_THREAD_REFRESH` merges updated comments into store
12. `GlobalComments.vue` re-renders via `mapState`

**User Selects Text → Creates Margin Comment:**

1. Muya `FlowriteSelectionMenu` plugin detects selection via `selectionChange` event
2. Plugin shows "Ask Flowrite" button positioned over selection
3. On click, dispatches `flowrite-selection-comment` event with `{ quote, start, end, rect }`
4. Vue listener (in editor shell) calls `$store.dispatch('OPEN_FLOWRITE_MARGIN_COMPOSER', selectionPayload)`
5. Vuex creates a `composerMarginThread` with a `MarginAnchor` (key+offset+quote+context)
6. `MarginCommentLayer.vue` renders `MarginThreadComposer` at the anchor's vertical position
7. User submits → `SUBMIT_MARGIN_COMMENT` → IPC → `FlowriteController.submitMarginComment` → same worker path as global comment

**Have a Look (AI Review):**

1. User clicks "Have a look!" in `Toolbar.vue`, selects persona and optional prompt in `HaveALookPopover.vue`
2. `Toolbar.vue` dispatches `RUN_AI_REVIEW` with `{ reviewPersona, prompt }`
3. Vuex → `ipcRenderer.invoke('mt::flowrite:run-ai-review', ...)` → `FlowriteController.runAiReview`
4. Controller uses `JOB_TYPE_AI_REVIEW` job type which enables only `create_comment` tool
5. `onProgress` callback fires after each comment tool call, pushing intermediate `mt::flowrite:tool-state-updated` events so comments appear incrementally
6. After completion, if any margin comments were created, Vuex auto-opens the annotations pane

**Accept Suggestion:**

1. `SuggestionCard.vue` emits `accept` with `suggestionId`
2. Parent dispatches `ACCEPT_SUGGESTION(suggestionId)` → IPC → `FlowriteController.acceptSuggestion`
3. Controller calls `resolveSuggestionTarget` to find the text range in current markdown
4. Returns `{ replacement: { start, end, text } }` to renderer
5. Vuex action applies the replacement: `SET_MARKDOWN` + `bus.$emit('file-changed')` to update Muya buffer
6. Suggestion status set to `APPLIED_IN_BUFFER`; finalized to `ACCEPTED` after next `Cmd+S` save

**Progress Updates (runtime → renderer):**

- Controller calls `browserWindow.webContents.send('mt::flowrite:runtime-progress', payload)` during job execution
- Renderer Vuex listener `LISTEN_FOR_FLOWRITE_RUNTIME` (registered at app startup) fires `UPDATE_FLOWRITE_RUNTIME_PROGRESS`
- Mutation `SET_FLOWRITE_RUNTIME_PROGRESS` updates `state.flowrite.runtime`; components read via `mapState`

## Key Abstractions

**FlowriteController:**
- Purpose: Single main-process object per app instance that owns all Flowrite operations
- Examples: `flowrite-marktext/src/main/flowrite/controller.js`
- Pattern: Method-per-job-type; each method validates, persists user action, queues AI job, refreshes renderer

**FlowriteRuntimeManager:**
- Purpose: Worker lifecycle + async request multiplexer; serializes jobs into a queue
- Examples: `flowrite-marktext/src/main/flowrite/ai/runtimeManager.js`
- Pattern: One `worker_thread` per session; jobs are queued via `this.queue = this.queue.then(run)`; tool calls are resolved via a `pendingRequests` Map

**RuntimeWorker (inline source string):**
- Purpose: The Anthropic API agentic loop running in isolation from the main thread
- Examples: `flowrite-marktext/src/main/flowrite/ai/runtimeWorker.js` (`buildRuntimeWorkerSource()`)
- Pattern: `while(true)` loop calling `anthropic.messages.create`; pauses on `tool_use` by posting `tool_call` to parent and awaiting `tool_result`; has inline fallback (`createInlineRuntime`) for environments where Worker is unavailable

**MarginAnchor:**
- Purpose: Persistent reference to a text selection that survives document edits
- Examples: `flowrite-marktext/src/flowrite/anchors/index.js`
- Pattern: Stores `{ start: {key, offset}, end: {key, offset}, quote, contextBefore, contextAfter }`. Resolution cascade: primary (exact key+offset), exact quote, fuzzy same-paragraph, fuzzy cross-paragraph window; falls back to `ANCHOR_DETACHED` at 72% similarity threshold

**Sidecar Path Scheme:**
- Purpose: Deterministic per-document metadata directory
- Examples: `flowrite-marktext/src/main/flowrite/files/sidecarPaths.js`
- Pattern: `<doc-dir>/.flowrite/<slug>-<sha1-12char>/` — slug from filename, hash from absolute path. Files: `document.json`, `comments.json`, `suggestions.json`, `snapshots/`

**Tool Registry:**
- Purpose: Per-job-type tool set restrictions (only `create_comment` for reviews, only `propose_suggestion` for rewrites)
- Examples: `flowrite-marktext/src/main/flowrite/ai/toolRegistry.js`
- Pattern: `TOOL_SETS` map from `JOB_TYPE_*` to allowed tool names; `getFlowriteTools(jobType)` returns filtered Anthropic tool definitions

## Entry Points

**Flowrite Main Process Bootstrap:**
- Location: `flowrite-marktext/src/main/dataCenter/index.js` (`DataCenter` constructor)
- Triggers: Electron main process startup; `DataCenter` is instantiated with app paths
- Responsibilities: Creates `FlowriteSettings`, `FlowriteController`; registers all `mt::flowrite:*` IPC handlers

**Flowrite Renderer Bootstrap:**
- Location: `flowrite-marktext/src/renderer/store/modules/flowrite.js` (`registerFlowriteLifecycle`)
- Triggers: Called once at Vuex store initialization; watches `editor.currentFile.pathname` and `preferences.flowrite`
- Responsibilities: Bootstraps Flowrite state on document open; re-bootstraps on settings change; registers IPC listeners via `LISTEN_FOR_FLOWRITE_RUNTIME`

**Muya Selection Plugin:**
- Location: `flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
- Triggers: Muya `selectionChange` event
- Responsibilities: Shows/hides "Ask Flowrite" button; dispatches `flowrite-selection-comment` with anchor data when clicked

## Error Handling

**Strategy:** Errors propagate from worker → RuntimeManager → Controller → IPC → Vuex → component. Each layer normalizes and re-throws rather than silently swallowing.

**Patterns:**
- `runtimeWorker.js`: Catches all errors in the agentic loop, posts `{ eventType: 'failed', payload: serializeError(error) }` to parent
- `FlowriteRuntimeManager`: Rejects the pending promise; clears all pending requests on worker error/exit; `normalizeFlowriteNetworkError` normalizes Anthropic network errors to typed error codes
- `FlowriteController._runWithProgress`: Catches all errors, calls `sendRuntimeProgress` with `RUNTIME_STATUS_FAILED` and error payload before re-throwing
- Vuex `SET_FLOWRITE_RUNTIME_PROGRESS`: Stores `error: { code, message }` in `state.flowrite.runtime`; components display `runtime.error.message`
- Tool iteration guard: `MAX_TOOL_ITERATIONS = 8` in `runtimeWorker.js` prevents infinite tool loops

## Cross-Cutting Concerns

**Logging:** `electron-log` used in `FlowriteRuntimeManager` and `FlowriteSettings` for main-process errors. No renderer-side logging.

**Validation:** `FlowriteController` validates `pathname`, `body`, and `anchor` presence before any async work. `FlowriteSettings` validates settings schema via `normalizeFlowriteSettings`. Anchor validity checked via `anchor.quote && anchor.start && anchor.end`.

**Authentication:** API key stored via `safeStorage.encryptString` → base64 in `electron-store`. `FlowriteSettings.resolveApiKey` falls back to `process.env.AI_GATEWAY_API_KEY` for dev/CI. Key is decrypted at job-start time (not cached in memory long-term).

**Thread Safety / Serialization:** `FlowriteRuntimeManager.queue` is a promise chain that serializes all jobs: `this.queue = this.queue.then(run)`. Concurrent IPC requests queue behind each other rather than running in parallel.

**Document Availability Gate:** `FlowriteController._runWithProgress` calls `flowriteSettings.getPublicState()` and throws early with `FLOWRITE_UNAVAILABLE` if `enabled` is false. Renderer side also reads `state.flowrite.availability.enabled` to disable UI elements.

---

*Architecture analysis: 2026-04-15*

# External Integrations

**Analysis Date:** 2026-04-15

## APIs & External Services

**AI / LLM:**
- Vercel AI Gateway — HTTP proxy in front of Anthropic's Messages API
  - SDK/Client: `@anthropic-ai/sdk` `^0.86.1`
  - Base URL: `https://ai-gateway.vercel.sh` (env `FLOWRITE_AI_BASE_URL` to override)
  - Model string: `anthropic/claude-sonnet-4.6` (env `FLOWRITE_MODEL` to override)
  - Auth: `AI_GATEWAY_API_KEY` env var or OS keychain via `electron.safeStorage`
  - Custom request header: `x-flowrite-runtime: marktext` on every call
  - Note: The SDK's `baseURL` is pointed at the Vercel gateway; the gateway routes to Anthropic. There is no direct Anthropic API key — the gateway key is used.
  - Client constructed in: `src/main/flowrite/ai/anthropicClient.js` (`createAnthropicClient`)

## AI Agent Loop

**Architecture:**
The agent loop runs in a Node.js `worker_thread` to avoid blocking the Electron main process. There are two runtime modes:

1. **Inline fallback** — if `Worker` is unsupported, an `EventEmitter`-based inline runner is used (`createInlineRuntime` in `src/main/flowrite/ai/runtimeWorker.js`)
2. **Worker thread** — default; source code for the worker is built as an inline string (`buildRuntimeWorkerSource`) and instantiated with `new Worker(source, { eval: true })`

**Loop Flow (per job):**

1. Renderer dispatches Vuex action (e.g. `RUN_AI_REVIEW`)
2. Vuex action calls `ipcRenderer.invoke('mt::flowrite:run-ai-review', payload)`
3. Main process `ipcMain.handle` (registered in `src/main/dataCenter/index.js`) delegates to `FlowriteController` (`src/main/flowrite/controller.js`)
4. Controller calls `FlowriteRuntimeManager.runJob()` (`src/main/flowrite/ai/runtimeManager.js`)
5. RuntimeManager loads conversation history from sidecar (`src/main/flowrite/files/documentStore.js`), builds a `buildRuntimeRequest` object
6. RuntimeManager posts `{ eventType: 'run_job', requestId, payload }` to the worker thread
7. **Worker thread loop** (`runtimeWorker.js` inline source):
   - Calls `runtime.client.messages.create(request)` — Anthropic SDK → Vercel gateway
   - If response contains `tool_use` blocks: posts `tool_call` event back to main thread, waits for `tool_result` or `tool_error`
   - Main thread's `handleWorkerMessage` calls `executeToolCall` (runs tool locally in Electron), returns result to worker via `tool_result` message
   - Loop continues until no `tool_use` blocks remain (or max 8 iterations: `MAX_TOOL_ITERATIONS`)
   - On clean finish: posts `{ eventType: 'completed', finalText, conversationEntries }`
8. RuntimeManager resolves the Promise, appends `conversationEntries` to history, saves updated history to sidecar
9. Controller sends `mt::flowrite:runtime-progress` (completed) and `mt::flowrite:tool-state-updated` events to renderer
10. Vuex store receives both events and updates UI state

**Key files:**
- `src/main/flowrite/ai/runtimeManager.js` — Orchestrates worker lifecycle, queues jobs, dispatches tool calls
- `src/main/flowrite/ai/runtimeWorker.js` — Worker thread source + inline fallback + `createRuntimeWorker` factory
- `src/main/flowrite/ai/anthropicClient.js` — `createAnthropicClient`, config resolution, undici polyfill
- `src/main/flowrite/ai/promptBuilder.js` — Builds `messages` array, system prompt, history trimming
- `src/main/flowrite/controller.js` — `FlowriteController` — job orchestration, tool execution, prompt construction

## Tool Definitions

Tools are registered in `src/main/flowrite/ai/toolRegistry.js`. The set of tools available to the model varies by job type.

**`create_comment`**
- Available for job types: `bootstrap`, `thread_reply`, `ai_review`
- Purpose: Creates a global or margin comment thread entry
- Required input: `scope` (`"global"` | `"margin"`), `body` (string)
- Optional input: `threadId` (string), `anchor` (object with `quote`, `start`, `end`)
- Execution: `FlowriteController.executeToolCall` → `appendCommentToThread` in `src/main/flowrite/files/commentsStore.js`
- Guardrails: `applyCommentGuardrails` strips markdown formatting (headings, bold, italic, blockquotes, fenced code, tables) when `threadMode === 'commenting'`. If result is empty, tool call is rejected.
- Returns: `{ ok: true, threadId, commentId }`

**`propose_suggestion`**
- Available for job type: `request_suggestion` only
- Purpose: Proposes a rewrite of a selected text passage
- Required input: `targetText` (original passage), `suggestedText` (proposed replacement)
- Optional input: `threadId`, `rationale`, `anchor`
- Execution: creates suggestion record in `src/main/flowrite/files/suggestionsStore.js` with status `pending`
- Returns: `{ ok: true, suggestionId }`

**Note:** `save_memory` tool referenced in CLAUDE.md design docs is not yet implemented in `src/main/flowrite/ai/toolRegistry.js`.

## Job Types and Tool Mapping

Defined in `src/flowrite/constants.js` and `src/main/flowrite/ai/toolRegistry.js`:

| Job Type | Constant | Tools Available | Trigger |
|---|---|---|---|
| `bootstrap` | `JOB_TYPE_BOOTSTRAP` | `create_comment` | Document open (planned) |
| `thread_reply` | `JOB_TYPE_THREAD_REPLY` | `create_comment` | User global/margin comment |
| `ai_review` | `JOB_TYPE_AI_REVIEW` | `create_comment` | "Have a look!" button |
| `request_suggestion` | `JOB_TYPE_REQUEST_SUGGESTION` | `propose_suggestion` | User rewrite request |

## IPC Channel Map

All Flowrite IPC channels use the `mt::flowrite:` prefix (MarkText convention). Channels defined in `src/main/dataCenter/index.js` and consumed in `src/renderer/store/modules/flowrite.js`.

**Invoke channels (renderer → main, returns Promise):**

| Channel | Handler | Purpose |
|---|---|---|
| `mt::flowrite:bootstrap-document` | `bootstrapFlowriteDocument(pathname)` | Load sidecar data on document open |
| `mt::flowrite:update-settings` | `setFlowriteSettings(settings)` | Save Flowrite preferences (API key, model, etc.) |
| `mt::flowrite:test-api-key` | `testFlowriteApiKey(settings)` | Validate API key with a 1-token test request |
| `mt::flowrite:submit-global-comment` | `controller.submitGlobalComment(payload)` | User submits to global discussion panel |
| `mt::flowrite:submit-margin-comment` | `controller.submitMarginComment(payload)` | User creates a margin thread from selection |
| `mt::flowrite:delete-thread` | `controller.deleteThread(payload)` | Delete a margin thread |
| `mt::flowrite:run-ai-review` | `controller.runAiReview(payload)` | "Have a look!" triggered review |
| `mt::flowrite:request-suggestion` | `controller.requestSuggestion(payload)` | User requests rewrite suggestion |
| `mt::flowrite:accept-suggestion` | `controller.acceptSuggestion(payload)` | Accept a pending suggestion (applies to buffer) |
| `mt::flowrite:reject-suggestion` | `controller.rejectSuggestion(payload)` | Reject a suggestion |
| `mt::flowrite:finalize-suggestions-after-save` | `controller.finalizeAcceptedSuggestionsAfterSave(payload)` | Confirm buffer-applied suggestions after Cmd+S |

**Push channels (main → renderer, one-way events):**

| Channel | Emitted by | Consumer | Purpose |
|---|---|---|---|
| `mt::flowrite:runtime-progress` | `controller.sendRuntimeProgress()` | `LISTEN_FOR_FLOWRITE_RUNTIME` action | Progress updates during AI job (running/completed/failed + message) |
| `mt::flowrite:tool-state-updated` | `controller.sendPersistedRefresh()` | `LISTEN_FOR_FLOWRITE_RUNTIME` action | Full comments+suggestions refresh after each tool call |

**Inherited MarkText channels that trigger Flowrite logic:**

| Channel | Flowrite reaction |
|---|---|
| `mt::tab-saved` | Calls `FINALIZE_ACCEPTED_SUGGESTIONS_AFTER_SAVE` |
| `mt::set-pathname` | Calls `FINALIZE_ACCEPTED_SUGGESTIONS_AFTER_SAVE` |

## Data Storage

**Sidecar Files (local filesystem — no cloud):**
- Location: `<doc-dir>/.flowrite/<slug>-<sha1-12>/<file>`
- Path resolution: `src/main/flowrite/files/sidecarPaths.js` (`getSidecarPaths`)
- Files per document:
  - `document.json` — schema version, conversation history, token estimate, review persona
  - `comments.json` — all thread records (global + margin)
  - `suggestions.json` — all suggestion records with lifecycle status
  - `snapshots/` — markdown snapshots taken before accepted suggestions

**App Settings (electron-store):**
- Key: `flowrite`
- Contents: `{ enabled, baseURL, model, collaborationMode, encryptedApiKey, hasCompletedFirstRun }`
- Written/read by `src/main/flowrite/settings/flowriteSettings.js` (`FlowriteSettings` class)

**API Key Security:**
- Encrypted at rest using `electron.safeStorage.encryptString()` → stored as base64 in `electron-store`
- Decrypted on demand via `safeStorage.decryptString()`
- Falls back to `process.env.AI_GATEWAY_API_KEY` if safeStorage unavailable

## Authentication & Identity

**AI Gateway:**
- API key stored encrypted in OS keychain via `electron.safeStorage`
- Sent as `Authorization: Bearer <key>` header by the Anthropic SDK
- Key validation: `mt::flowrite:test-api-key` sends a 1-token `messages.create` call; error is normalized by `normalizeFlowriteNetworkError`

## Monitoring & Observability

**Error Tracking:**
- `electron-log` `^4.4.6` — structured logging in main process
- Network errors normalized by `src/main/flowrite/network/status.js`: offline errors (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, etc.) become `AI_UNAVAILABLE` code

**Logs:**
- `electron-log` writes to OS log file; used in `runtimeManager.js` for history persistence failures and in `flowriteSettings.js` for decryption failures

## Have a Look Feature — Wiring Status

The "Have a look!" UI exists and is fully rendered (`src/renderer/components/flowrite/Toolbar.vue`, `HaveALookPopover.vue`). The `runReview` method in `Toolbar.vue` dispatches `RUN_AI_REVIEW` to Vuex, which invokes `mt::flowrite:run-ai-review` IPC. The main process handler calls `controller.runAiReview()`.

**The full round-trip is wired end to end.** The Toolbar dispatches → IPC → Controller → RuntimeManager → Worker → Anthropic. The only gap is that `JOB_TYPE_BOOTSTRAP` (auto-review on document open) has no scheduled invocation in the current controller.

## CI/CD & Deployment

**Hosting:**
- Desktop app (no server deployment)
- Distributed as packaged Electron binary per `electron-builder.yml`

**CI Pipeline:**
- Not detected (no CI config files in repository)

---

*Integration audit: 2026-04-15*

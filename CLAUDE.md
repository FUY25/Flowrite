# Flowrite

## What This Is

Flowrite is a markdown writing environment for serious writers who want AI as a thoughtful commenting companion, not a ghostwriter. Forked from MarkText (vendor/marktext).

## Architecture

- **Desktop app:** Electron + Vue 2 + Vuex + Muya (from MarkText)
- **AI backend:** Currently Anthropic SDK via Vercel AI gateway. Target: direct Anthropic Messages API via `@anthropic-ai/sdk` (TypeScript SDK)
- **NOT Managed Agents** — the original plan used Claude Managed Agents but this was changed during CEO review. Messages API with custom tool use is the correct choice for request/response interactions in a desktop app.
- **Agent loop:** Runs in a Node.js `worker_thread` to avoid blocking the main process
- **Tools:** Custom tools executed locally by Electron (read_file, edit_file, search_files, create_comment, propose_suggestion, save_memory)
- **Storage:** Plain .md files are canonical. Metadata in .flowrite/ sidecar directory
- **CLI tools:** Planned dedicated CLI that Claude Code/Codex can use to interact with Flowrite (leave comments, trigger discussion, rewrite files)

## Key Design Decisions

### Three Interaction Modes
1. **AI Review button ("Have a Look")** — AI proactively reviews document with a chosen persona (friendly, critical, improvement). One-click trigger that generates both global and margin comments.
2. **User margin comment** — user selects text, writes a comment, AI responds in thread. Sidebar cards with one-line AI summary tabs (inspired by Arc browser bookmarks).
3. **User global comment** — user writes a global comment in the bottom discussion panel, AI responds in thread.

### Two Content Types in Sidebar
- **Discussion/comments** — valuable exchange that persists permanently. Users can revisit and continue threads.
- **Suggestion cards (actions)** — rewrite proposals that appear as cards. After user accepts or declines, the card disappears from UI. No resolve button needed — accept/reject is the terminal action.

### AI Behavior Rules
- AI uses structured tool calls (create_comment, propose_suggestion), not free text
- AI comments before it rewrites (comment-first behavior)
- Every rewrite is a suggestion that must be explicitly accepted or rejected
- No silent edits. No auto-apply.
- Text blocks are locked during AI response (no edits to in-flight anchor ranges)

### Session Model
- **One session per article** (not per thread) — sidebar comments and global discussion share the same AI session/chat history. Only UI distribution differs.
- Conversation history stored in .flowrite/document.json
- History loaded on document open, providing cross-thread context
- Compaction at 80K tokens: summarize oldest 60% of turns
- Comments output is plain text only (no markdown) — keeps comments clean like Notion/Lark. Rewrite mode allows markdown output.

### Cross-Session Memory
- Claude calls save_memory() tool to remember writer facts/preferences/context
- Stored at ~/.flowrite/writer-memory.json (user-level, not per-doc)
- Append-only in V1. Max 4000 tokens injected into system prompt. FIFO overflow.

### API Key
- Stored via Electron safeStorage (OS keychain encryption)
- First-run welcome screen with key input + validation
- App works offline for editing; AI features disabled without key/network

### Sidecar Metadata
```
<doc-dir>/<doc-name>.md
<doc-dir>/.flowrite/
  document.json    (schema version, conversation history, settings)
  comments.json    (global + margin threads, anchors)
  suggestions.json (pending/accepted/rejected)
  versions/        (snapshot manifests)
  snapshots/       (historical markdown states)
```

### Anchor Resolution
- Anchors use Muya paragraph IDs + character offsets + quoted text
- On drift: fuzzy reattachment via quote field (text similarity search)
- If no match (< 60% similarity): mark comment as "detached"
- Before applying suggestions: validate anchor.quote still matches

### Auto-Save & Version History
- Currently no auto-save — user must Cmd+S. Auto-save is planned.
- Auto-save and version history to be built together using Git tree (each accepted edit = a commit)
- Version history is a core writing tool feature — ability to rewind to any prior state

### Two Product Versions
- **Open source version:** Free, user provides own API key. Clean markdown editor with sidebar comments, global discussion, Have a Look. Ship first to build community/reputation.
- **Premium version (future):** Memory system, voice "Flow mode", cloud sync. Supports subscription pricing.

### Voice "Flow Mode" (Future)
- Killer differentiator — no one has built this yet
- User speaks, local Whisper transcribes to text, Claude thinks and writes
- AI responds in text (not voice) — supports deeper thinking, saves tokens
- Triggered via slash commands (/journal, /brainstorm, etc.) — each is a customizable skill
- Overlays on focus mode: screen dims, conversation happens in highlighted area, document writes itself
- After finalize, overlay disappears and text is committed to document
- Three use cases: journaling (AI interviews you), brainstorming (collaborative ideation), technical writing (plan documents via conversation)

### Security
- Tool path scoping: all file tools restricted to document parent directory
- Prompt injection boundary in system prompt (document content = text to analyze, not instructions)
- No secrets in sidecar metadata

## File Structure

- `design.md` — Product design document
- `marktext-feasibility.md` — MarkText fork feasibility analysis
- `docs/superpowers/plans/` — Implementation plan
- `docs/ceo-plans/` — CEO review and scope decisions
- `vendor/marktext/` — MarkText fork (implementation base)
- `vendor/marktext/src/main/flowrite/` — Flowrite main-process code
- `vendor/marktext/src/renderer/components/flowrite/` — Flowrite Vue components
- `vendor/marktext/src/renderer/store/modules/flowrite*.js` — Vuex modules

## Commands

```bash
# Install MarkText dependencies
npm --prefix vendor/marktext install

# Run in dev mode
npm --prefix vendor/marktext run dev

# Run unit tests
npm --prefix vendor/marktext run unit

# Run e2e tests
npm --prefix vendor/marktext run e2e
```

## IPC Convention

MarkText uses `mt::` prefix for IPC channels. Flowrite additions use `mt::flowrite:` prefix for consistency.

## Project Tracking

Notion hub: https://www.notion.so/7ce2470396f6833da12401a57e1422b5

This is the project home page for Pan and Yumin. It contains inline databases for:
- **Tasks** — Kanban board with status, priority, assignee, phase, type (prefix FW-###)
- **Milestones** — M1 through M6 roadmap phases with status and target dates
- **Meeting Notes** — dated entries with attendees, type, action items, and full transcriptions

It also links to:
- **Product Requirements (PRD)** — full product spec
- **Design Decisions Log** — numbered decisions (DD-001+) with rationale

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Flowrite: Have a Look AI Review**

The "Have a Look" feature in Flowrite — a one-click AI review that reads the entire document and generates both global comments and margin comments in a single pass. The user picks a persona (Friendly, Critical, Improvement) and the AI produces thoughtful, multi-comment feedback. This is the flagship AI feature that distinguishes Flowrite from other markdown editors.

**Core Value:** A writer can click one button and receive intelligent, multi-location document feedback — both in the margin (passage-specific) and in global discussion (document-wide) — without leaving their draft.

### Constraints

- **Tech stack**: Electron + Vue 2 + Vuex + Muya (MarkText fork) — no migration
- **AI backend**: Anthropic SDK via Vercel AI gateway — keep current gateway, target direct API later
- **Comments format**: Plain text only, no markdown (DD-006)
- **Session model**: Single session per article (DD-001) — AI Review joins existing history
- **API key**: User's own key via Electron safeStorage — no subscription harnessing
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ES2020+) — All application code: Electron main process, Vue renderer, shared modules
- Vue SFC (`.vue`) — Renderer UI components with inline `<template>`, `<script>`, `<style scoped>`
- CSS (scoped, PostCSS with `color-mix()`) — Component styles, uses CSS custom properties for theming
## Runtime
- Node.js — Electron main process (worker_threads, fs-extra, path, crypto)
- Chromium renderer — Vue 2 SPA in Electron renderer process
- Worker threads — AI agent loop runs in a `worker_thread` spawned by Node.js main process
- `^29.4.6` (devDependency; actual binary rebuilt against target Node ABI)
- `@electron/remote` `^2.1.3` — Bridges renderer/main for remote module calls
## Package Manager
- **Yarn** (lockfile: `yarn.lock` present)
- Also usable with `npm` (root-level `package-lock.json` in project root)
## Frameworks
- Vue `^2.6.14` — Renderer SPA framework (Options API throughout)
- Vuex `^3.6.2` — State management (modules pattern; `flowrite` module at `src/renderer/store/modules/flowrite.js`)
- Vue Router `^3.5.3` — Client-side routing in renderer
- Element UI `^2.15.8` — Component library (dialogs, forms in preferences)
- Muya — Custom in-source WYSIWYG markdown editor (`src/muya/`) forked from MarkText
- Webpack `^5.72.0` — Bundler for both main and renderer processes
- `electron-vue` build scripts in `.electron-vue/` directory
- Babel `^7.x` — Transpilation with `@babel/preset-env`, class properties plugin
- `electron-builder` `^26.8.1` — Packaging/release
- Karma `^6.3.18` + Mocha `^9.2.2` — Unit test runner (`src/renderer`, `src/main`)
- `@playwright/test` `^1.59.1` — End-to-end tests (`test/e2e/`)
- `chai` `^4.3.6` — Assertions in unit and eval tests
- `dotenv` `^16.0.0` — Required for flowrite eval tests (`test/evals/flowrite-smoke.spec.js`)
## Key Dependencies
- `@anthropic-ai/sdk` `^0.86.1` — Official Anthropic TypeScript/JavaScript SDK. Used in both the Electron main process (`src/main/flowrite/ai/anthropicClient.js`) and injected into the `worker_thread` runtime string at build time.
- `undici` `^5.28.5` — Polyfills `fetch`, `Headers`, `Request`, `Response`, `FormData` for Anthropic SDK in Node.js/Electron environments that lack native fetch APIs. Applied in both main process and worker thread global scope.
- `fs-extra` `^10.1.0` — Extended fs for sidecar JSON reads/writes (`src/main/flowrite/files/`)
- `electron-store` `^8.0.1` — Persistent settings store for Flowrite preferences (base URL, model, encrypted API key, collaborationMode)
- `keytar` `^7.9.0` — Native credential storage (present in dependencies; `electron.safeStorage` is the primary encryption mechanism)
- `codemirror` `^5.65.2` — Code block editing inside Muya
- `prismjs` `^1.27.0` — Syntax highlighting
- `snabbdom` `^3.4.0` + `snabbdom-to-html` `^7.0.0` — Virtual DOM used by Muya
- `mermaid` `^10.0.0` — Diagram rendering in editor
- `axios` `^0.26.1` — Used in renderer for preferences/image upload paths (not for AI calls)
- `electron-log` `^4.4.6` — Structured logging in main process
- `fuzzaldrin` `^2.1.0` — Fuzzy string matching (used for anchor drift reattachment)
- `vscode-ripgrep` `^1.12.1` — Search in open folder
## Configuration
- `AI_GATEWAY_API_KEY` — API key for Vercel AI gateway; fallback when no key is stored in safeStorage
- `FLOWRITE_MODEL` — Override default model (default: `anthropic/claude-sonnet-4.6`)
- `FLOWRITE_AI_BASE_URL` — Override gateway base URL (default: `https://ai-gateway.vercel.sh`)
- `FLOWRITE_TEST_CLIENT_MODULE` — Path to a test client module for eval tests
- Actual values NOT committed; `.env` file used in test contexts via `dotenv`
- `flowrite-marktext/electron-builder.yml` — Electron packaging targets (macOS, Linux, Windows)
- `flowrite-marktext/babel.config.js` — Babel config
- `flowrite-marktext/.electron-vue/` — Webpack configs for main/renderer and dev-runner
- Stored via `electron-store` under key `flowrite`
- Fields: `enabled`, `baseURL`, `model`, `collaborationMode`, `encryptedApiKey`, `hasCompletedFirstRun`
- API key encrypted at rest using `electron.safeStorage.encryptString` (OS keychain)
## Platform Requirements
- Node.js (compatible with Electron 29 ABI)
- Yarn (for lockfile fidelity)
- macOS/Linux/Windows (electron-rebuild required for native modules: `keytar`, `native-keymap`, `fontmanager-redux`)
- Packaged as Electron desktop app
- macOS, Linux, Windows targets via `electron-builder`
- AI features require internet access + valid `AI_GATEWAY_API_KEY`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Vue SFCs: PascalCase — `MarginThreadCard.vue`, `GlobalComments.vue`, `SuggestionCard.vue`
- Plain JS modules: camelCase — `marginLayout.js`, `runtimeManager.js`, `commentsStore.js`
- Test specs: kebab-case with scope prefix — `flowrite-renderer-store.spec.js`, `flowrite-ai-runtime.spec.js`
- Constants file at shared boundary: `src/flowrite/constants.js` (not under main/ or renderer/)
- camelCase for all functions: `createDefaultFlowriteState`, `normalizeAvailability`, `resolveMarginThread`
- Factory functions prefixed with `create`: `createRuntimeState()`, `createMarginAnchor()`, `createSuggestionId()`
- Normalization helpers prefixed with `normalize`: `normalizeError()`, `normalizeAvailability()`, `normalizeCommentBody()`
- Boolean helpers prefixed with `is`/`has`/`should`: `isWindowAlive()`, `isDetached()`, `shouldIgnoreThreadRefresh()`
- Build functions for prompt parts prefixed with `build`: `buildGlobalCommentPrompt()`, `buildRuntimeRequest()`
- camelCase throughout
- Boolean state variables use `is` prefix: `isReplyPending`, `isExpanded`, `isRunning`
- Pending/draft UI state uses `draft` suffix: `replyDraft`, `draft` (in GlobalComments)
- SCREAMING_SNAKE_CASE for all exported constants in `src/flowrite/constants.js`
- Examples: `RUNTIME_STATUS_IDLE`, `SCOPE_MARGIN`, `AUTHOR_USER`, `PHASE_AI_REVIEW`
- Grouped by domain with inline comments (suggestion statuses, runtime statuses, thread scopes, etc.)
## Code Style
- Tool: ESLint (`.eslintrc.js` at `flowrite-marktext/.eslintrc.js`)
- 2-space indentation (enforced via `indent: ['error', 2]`, SwitchCase: 1)
- No semicolons (`semi: [2, 'never']`)
- Standard JS style as baseline (`extends: ['standard']`)
- Arrow functions: parentheses optional (`arrow-parens: 'off'`)
- Base: `eslint:recommended` + `standard` + `plugin:vue/base` + `plugin:import/errors`
- Key rules: `no-return-await`, `no-return-assign`, `no-new` — all error-level
- `prefer-const` is off (MarkText legacy; use `const` in new Flowrite code anyway)
- `no-console` is off (logging allowed)
## Import Organization
- `@` resolves to `src/renderer/`
- `common` resolves to `src/common/`
- `muya` resolves to `src/muya/`
- Flowrite code uses relative paths explicitly (no alias for `src/flowrite/`)
## Vue Component Patterns (Vue 2 SFCs)
## Vuex Store Patterns
- `SET_` for simple field assignment
- `APPLY_` for merging/bootstrapping complex payloads
- `RESET_` for clearing state to defaults
## IPC Communication Patterns
- `mt::flowrite:bootstrap-document` — load sidecars for a file
- `mt::flowrite:submit-global-comment` — send user global comment + trigger AI
- `mt::flowrite:submit-margin-comment` — send user margin comment + trigger AI
- `mt::flowrite:run-ai-review` — trigger full document AI review
- `mt::flowrite:request-suggestion` — request a rewrite suggestion
- `mt::flowrite:accept-suggestion` — apply a suggestion to buffer
- `mt::flowrite:reject-suggestion` — mark suggestion rejected
- `mt::flowrite:finalize-suggestions-after-save` — confirm applied suggestions on save
- `mt::flowrite:delete-thread` — delete a margin thread
- `mt::flowrite:runtime-progress` — live status updates during AI job
- `mt::flowrite:tool-state-updated` — persisted state refresh after tool calls
## Error Handling Patterns
## Logging
- Log errors at `log.error(message, error)` for persistence failures and unexpected states
- No `console.log` in production paths (but ESLint does not ban it — discipline required)
- Renderer components surface errors via local state strings shown in template (`statusMessage`, `submitError`), not console
## Comments
- Block comments above non-obvious logic (e.g., worker message protocol, anchor resolution fallbacks)
- Inline `// TODO: fix these errors someday` in ESLint config for known suppressions
- Comment bodies in prompts use `//` ESLint-style disable comments for Webpack `__non_webpack_require__`
- Not used. No type annotations in Flowrite code.
## Module Design
- Named exports preferred for utilities: `export const createMarginAnchor`, `export const normalizeCommentBody`
- Default exports for Vue components: `export default { ... }`
- Default exports for class-based modules: `export default FlowriteController`
- Both named and default when the class is the main export but factory functions are also needed: see `anthropicClient.js`
- Not used in Flowrite additions. Each consumer imports directly from source files.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Flowrite code is fully separated from MarkText code in dedicated directories
- AI work runs in a Node.js `worker_thread` to avoid blocking the main process
- All state changes flow through Vuex; components never call IPC directly
- Sidecar files (`.flowrite/` directory) are the canonical persistence layer; Vuex is derived/cached state
- IPC channel prefix `mt::flowrite:` distinguishes Flowrite handlers from MarkText's `mt::` handlers
## Layers
- Purpose: Types, status codes, and pure logic shared by both renderer and main process
- Location: `flowrite-marktext/src/flowrite/`
- Contains: `constants.js`, anchor resolution logic (`anchors/index.js`), suggestion resolution logic (`suggestions/index.js`)
- Depends on: nothing (no Electron, no Vue)
- Used by: both main process (`src/main/flowrite/`) and renderer (`src/renderer/`)
- Purpose: All Flowrite UI — toolbar, margin threads, global discussion, suggestion cards
- Location: `flowrite-marktext/src/renderer/components/flowrite/`
- Contains: 11 `.vue` files and 1 layout utility
- Depends on: Vuex store (`flowrite` module), `src/flowrite/` shared utilities
- Used by: MarkText editor shell (`editorWithTabs`)
- Purpose: Flowrite application state, IPC dispatch, lifecycle wiring
- Location: `flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Contains: one monolithic module with state, mutations, and actions
- Depends on: `ipcRenderer`, `src/flowrite/constants`, `src/flowrite/anchors`
- Used by: Vue components via `mapState` and `$store.dispatch`
- Purpose: Registers `ipcMain.handle` handlers for all `mt::flowrite:*` channels
- Location: `flowrite-marktext/src/main/dataCenter/index.js` (lines 254–316)
- Contains: 11 IPC handlers that delegate to `FlowriteController` or `FlowriteSettings`
- Depends on: `FlowriteController`, `FlowriteSettings`, Electron's `ipcMain`, `BrowserWindow`
- Used by: Electron main process startup (`DataCenter` constructor → `_listenForIpcMain()`)
- Purpose: Orchestrates all AI jobs and sidecar file mutations; the main-process "service layer"
- Location: `flowrite-marktext/src/main/flowrite/controller.js`
- Contains: `FlowriteController` class — methods for each job type, prompt building, tool execution, suggestion lifecycle
- Depends on: `FlowriteRuntimeManager`, `commentsStore`, `suggestionsStore`, `documentStore`, `snapshotStore`, `collaborationRouting`, `commentGuardrails`
- Used by: `DataCenter` (instantiated once per app lifetime)
- Purpose: Manages the worker_thread lifecycle, job queuing, and bidirectional tool-call protocol
- Location: `flowrite-marktext/src/main/flowrite/ai/`
- Contains: `runtimeManager.js`, `runtimeWorker.js`, `promptBuilder.js`, `toolRegistry.js`, `anthropicClient.js`, `collaborationRouting.js`, `commentGuardrails.js`
- Depends on: `@anthropic-ai/sdk`, `undici`, `worker_threads`
- Used by: `FlowriteController` via `FlowriteRuntimeManager`
- Purpose: Read/write JSON sidecar files for all Flowrite document state
- Location: `flowrite-marktext/src/main/flowrite/files/`
- Contains: `documentStore.js`, `commentsStore.js`, `suggestionsStore.js`, `snapshotStore.js`, `sidecarPaths.js`, `status.js`
- Depends on: Node.js `fs`, `path`, `crypto`
- Used by: `FlowriteController`, `FlowriteRuntimeManager`
- Purpose: Stores API key (via Electron `safeStorage`), model config, collaboration mode; provides availability state
- Location: `flowrite-marktext/src/main/flowrite/settings/flowriteSettings.js`
- Contains: `FlowriteSettings` class
- Depends on: `electron-store`, Electron `safeStorage`
- Used by: `DataCenter` (instantiated once); `FlowriteController` queries it before every job
- Purpose: "Ask Flowrite" popup that appears on text selection inside the editor
- Location: `flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/`
- Contains: `FlowriteSelectionMenu` Muya plugin (`index.js`, `index.css`)
- Depends on: Muya `BaseFloat`, `selection`, `eventCenter`
- Used by: Muya event system; dispatches `flowrite-selection-comment` event that the Vue layer listens for
## Data Flow
- Controller calls `browserWindow.webContents.send('mt::flowrite:runtime-progress', payload)` during job execution
- Renderer Vuex listener `LISTEN_FOR_FLOWRITE_RUNTIME` (registered at app startup) fires `UPDATE_FLOWRITE_RUNTIME_PROGRESS`
- Mutation `SET_FLOWRITE_RUNTIME_PROGRESS` updates `state.flowrite.runtime`; components read via `mapState`
## Key Abstractions
- Purpose: Single main-process object per app instance that owns all Flowrite operations
- Examples: `flowrite-marktext/src/main/flowrite/controller.js`
- Pattern: Method-per-job-type; each method validates, persists user action, queues AI job, refreshes renderer
- Purpose: Worker lifecycle + async request multiplexer; serializes jobs into a queue
- Examples: `flowrite-marktext/src/main/flowrite/ai/runtimeManager.js`
- Pattern: One `worker_thread` per session; jobs are queued via `this.queue = this.queue.then(run)`; tool calls are resolved via a `pendingRequests` Map
- Purpose: The Anthropic API agentic loop running in isolation from the main thread
- Examples: `flowrite-marktext/src/main/flowrite/ai/runtimeWorker.js` (`buildRuntimeWorkerSource()`)
- Pattern: `while(true)` loop calling `anthropic.messages.create`; pauses on `tool_use` by posting `tool_call` to parent and awaiting `tool_result`; has inline fallback (`createInlineRuntime`) for environments where Worker is unavailable
- Purpose: Persistent reference to a text selection that survives document edits
- Examples: `flowrite-marktext/src/flowrite/anchors/index.js`
- Pattern: Stores `{ start: {key, offset}, end: {key, offset}, quote, contextBefore, contextAfter }`. Resolution cascade: primary (exact key+offset), exact quote, fuzzy same-paragraph, fuzzy cross-paragraph window; falls back to `ANCHOR_DETACHED` at 72% similarity threshold
- Purpose: Deterministic per-document metadata directory
- Examples: `flowrite-marktext/src/main/flowrite/files/sidecarPaths.js`
- Pattern: `<doc-dir>/.flowrite/<slug>-<sha1-12char>/` — slug from filename, hash from absolute path. Files: `document.json`, `comments.json`, `suggestions.json`, `snapshots/`
- Purpose: Per-job-type tool set restrictions (only `create_comment` for reviews, only `propose_suggestion` for rewrites)
- Examples: `flowrite-marktext/src/main/flowrite/ai/toolRegistry.js`
- Pattern: `TOOL_SETS` map from `JOB_TYPE_*` to allowed tool names; `getFlowriteTools(jobType)` returns filtered Anthropic tool definitions
## Entry Points
- Location: `flowrite-marktext/src/main/dataCenter/index.js` (`DataCenter` constructor)
- Triggers: Electron main process startup; `DataCenter` is instantiated with app paths
- Responsibilities: Creates `FlowriteSettings`, `FlowriteController`; registers all `mt::flowrite:*` IPC handlers
- Location: `flowrite-marktext/src/renderer/store/modules/flowrite.js` (`registerFlowriteLifecycle`)
- Triggers: Called once at Vuex store initialization; watches `editor.currentFile.pathname` and `preferences.flowrite`
- Responsibilities: Bootstraps Flowrite state on document open; re-bootstraps on settings change; registers IPC listeners via `LISTEN_FOR_FLOWRITE_RUNTIME`
- Location: `flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
- Triggers: Muya `selectionChange` event
- Responsibilities: Shows/hides "Ask Flowrite" button; dispatches `flowrite-selection-comment` with anchor data when clicked
## Error Handling
- `runtimeWorker.js`: Catches all errors in the agentic loop, posts `{ eventType: 'failed', payload: serializeError(error) }` to parent
- `FlowriteRuntimeManager`: Rejects the pending promise; clears all pending requests on worker error/exit; `normalizeFlowriteNetworkError` normalizes Anthropic network errors to typed error codes
- `FlowriteController._runWithProgress`: Catches all errors, calls `sendRuntimeProgress` with `RUNTIME_STATUS_FAILED` and error payload before re-throwing
- Vuex `SET_FLOWRITE_RUNTIME_PROGRESS`: Stores `error: { code, message }` in `state.flowrite.runtime`; components display `runtime.error.message`
- Tool iteration guard: `MAX_TOOL_ITERATIONS = 8` in `runtimeWorker.js` prevents infinite tool loops
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

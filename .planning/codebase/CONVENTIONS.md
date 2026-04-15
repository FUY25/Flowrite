# Coding Conventions

**Analysis Date:** 2026-04-15

## Naming Patterns

**Files:**
- Vue SFCs: PascalCase — `MarginThreadCard.vue`, `GlobalComments.vue`, `SuggestionCard.vue`
- Plain JS modules: camelCase — `marginLayout.js`, `runtimeManager.js`, `commentsStore.js`
- Test specs: kebab-case with scope prefix — `flowrite-renderer-store.spec.js`, `flowrite-ai-runtime.spec.js`
- Constants file at shared boundary: `src/flowrite/constants.js` (not under main/ or renderer/)

**Functions:**
- camelCase for all functions: `createDefaultFlowriteState`, `normalizeAvailability`, `resolveMarginThread`
- Factory functions prefixed with `create`: `createRuntimeState()`, `createMarginAnchor()`, `createSuggestionId()`
- Normalization helpers prefixed with `normalize`: `normalizeError()`, `normalizeAvailability()`, `normalizeCommentBody()`
- Boolean helpers prefixed with `is`/`has`/`should`: `isWindowAlive()`, `isDetached()`, `shouldIgnoreThreadRefresh()`
- Build functions for prompt parts prefixed with `build`: `buildGlobalCommentPrompt()`, `buildRuntimeRequest()`

**Variables:**
- camelCase throughout
- Boolean state variables use `is` prefix: `isReplyPending`, `isExpanded`, `isRunning`
- Pending/draft UI state uses `draft` suffix: `replyDraft`, `draft` (in GlobalComments)

**Constants:**
- SCREAMING_SNAKE_CASE for all exported constants in `src/flowrite/constants.js`
- Examples: `RUNTIME_STATUS_IDLE`, `SCOPE_MARGIN`, `AUTHOR_USER`, `PHASE_AI_REVIEW`
- Grouped by domain with inline comments (suggestion statuses, runtime statuses, thread scopes, etc.)

**Vuex mutations:** SCREAMING_SNAKE_CASE with `FLOWRITE_` prefix — `APPLY_FLOWRITE_BOOTSTRAP`, `SET_FLOWRITE_RUNTIME_PROGRESS`

**Vuex actions:** SCREAMING_SNAKE_CASE with descriptive verb — `BOOTSTRAP_FLOWRITE_DOCUMENT`, `SUBMIT_MARGIN_COMMENT`, `TOGGLE_FLOWRITE_ANNOTATIONS_PANE`

**CSS classes:** BEM-style with `flowrite-` prefix — `flowrite-margin-thread-card__surface`, `flowrite-global-comments__composer`. Modifier classes use `is-` prefix — `is-active`, `is-detached`, `is-composer`.

## Code Style

**Formatting:**
- Tool: ESLint (`.eslintrc.js` at `flowrite-marktext/.eslintrc.js`)
- 2-space indentation (enforced via `indent: ['error', 2]`, SwitchCase: 1)
- No semicolons (`semi: [2, 'never']`)
- Standard JS style as baseline (`extends: ['standard']`)
- Arrow functions: parentheses optional (`arrow-parens: 'off'`)

**Linting:**
- Base: `eslint:recommended` + `standard` + `plugin:vue/base` + `plugin:import/errors`
- Key rules: `no-return-await`, `no-return-assign`, `no-new` — all error-level
- `prefer-const` is off (MarkText legacy; use `const` in new Flowrite code anyway)
- `no-console` is off (logging allowed)

## Import Organization

**Order (observed in Flowrite files):**
1. Node built-ins (`fs`, `path`, `events`, `worker_threads`)
2. Electron (`electron`, `electron-log`)
3. Third-party packages (`@anthropic-ai/sdk`, `undici`)
4. Internal cross-boundary shared code (`../../../flowrite/constants`, `../../../flowrite/anchors`)
5. Sibling Flowrite modules (`./runtimeManager`, `./commentsStore`, `./promptBuilder`)
6. Vue/renderer (`vuex`, `../../bus`)

**Path Aliases:**
- `@` resolves to `src/renderer/`
- `common` resolves to `src/common/`
- `muya` resolves to `src/muya/`
- Flowrite code uses relative paths explicitly (no alias for `src/flowrite/`)

## Vue Component Patterns (Vue 2 SFCs)

**Structure order:**
```
<template> ... </template>
<script> ... </script>
<style scoped> ... </style>
```

**Options API object key order:**
`components` → `props` → `data()` → `computed` → `watch` → `mounted` → `beforeDestroy` → `methods`

**Props definition — always use full object syntax:**
```js
props: {
  thread: {
    type: Object,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  }
}
```

**Computed properties from Vuex — use `mapState` with arrow functions:**
```js
computed: {
  ...mapState({
    comments: state => state.flowrite.comments,
    runtime: state => state.flowrite.runtime
  }),
  // local computed props follow
  isRunning () {
    return this.runtime.status === RUNTIME_STATUS_RUNNING
  }
}
```

**Event emission pattern — use promise-resolve/reject for async round-trips:**
```js
// Parent passes resolve/reject into child event payload
this.$emit('reply', { threadId, body, resolve, reject })
// Child wraps in a Promise to await completion
await new Promise((resolve, reject) => {
  this.$emit('submit-composer', { body, anchor, resolve, reject })
})
```

**Store dispatch from components:**
```js
// Direct $store access is used (not mapActions)
this.$store.dispatch('ACTIVATE_MARGIN_THREAD', threadId)
await this.$store.dispatch('SUBMIT_GLOBAL_COMMENT', nextDraft)
```

**RAF pattern for layout work:**
```js
scheduleRefresh () {
  if (this.rafId) {
    window.cancelAnimationFrame(this.rafId)
  }
  this.rafId = window.requestAnimationFrame(() => {
    this.rafId = null
    this.refreshResolvedThreads()
  })
}
```
Cancel in `beforeDestroy`. Store RAF IDs as `this.rafId`.

**Watcher pattern:**
```js
watch: {
  thread: {
    immediate: true,
    handler (nextThread) { ... }
  },
  'currentFile.pathname' () {
    this.draft = ''
  }
}
```

**data-testid attributes** are placed on all interactive elements and key containers — `data-testid="flowrite-margin-thread"`, `data-testid="flowrite-global-comments-input"`. Use `null` to suppress testids on composer variants.

## Vuex Store Patterns

**State shape:** Defined in an exported `createDefaultFlowriteState()` factory function. This enables test isolation (each test instantiates fresh state).

**Mutation naming:** All Flowrite mutations start with one of: `SET_FLOWRITE_`, `APPLY_FLOWRITE_`, `RESET_FLOWRITE_`, `ROTATE_FLOWRITE_`.
- `SET_` for simple field assignment
- `APPLY_` for merging/bootstrapping complex payloads
- `RESET_` for clearing state to defaults

**Mutations always normalize inputs:**
```js
APPLY_FLOWRITE_BOOTSTRAP (state, payload = {}) {
  state.comments = cloneArray(payload.comments)  // never assign directly
  state.availability = normalizeAvailability(payload.availability)
  state.document = payload.document && typeof payload.document === 'object'
    ? { ...payload.document }
    : null
}
```

**Actions use `rootState` for cross-module reads:**
```js
async SUBMIT_GLOBAL_COMMENT ({ rootState }, body) {
  const currentFile = rootState.editor && rootState.editor.currentFile
    ? rootState.editor.currentFile
    : {}
}
```

**IPC calls belong in actions, not mutations:**
```js
payload = await ipcRenderer.invoke('mt::flowrite:bootstrap-document', { pathname })
```

**Race condition guard pattern** — actions check request IDs and pathnames to drop stale IPC responses:
```js
if (currentPathname !== requestedPathname || state.bootstrapRequestId !== requestId) {
  return payload  // stale, discard
}
```

**Lifecycle watchers** are registered via the exported `registerFlowriteLifecycle(store)` function (not inside the module itself), keeping store module pure and testable.

## IPC Communication Patterns

**Channel naming convention:** All Flowrite IPC channels use the `mt::flowrite:` prefix.

**Renderer → Main (invoke):**
- `mt::flowrite:bootstrap-document` — load sidecars for a file
- `mt::flowrite:submit-global-comment` — send user global comment + trigger AI
- `mt::flowrite:submit-margin-comment` — send user margin comment + trigger AI
- `mt::flowrite:run-ai-review` — trigger full document AI review
- `mt::flowrite:request-suggestion` — request a rewrite suggestion
- `mt::flowrite:accept-suggestion` — apply a suggestion to buffer
- `mt::flowrite:reject-suggestion` — mark suggestion rejected
- `mt::flowrite:finalize-suggestions-after-save` — confirm applied suggestions on save
- `mt::flowrite:delete-thread` — delete a margin thread

**Main → Renderer (send):**
- `mt::flowrite:runtime-progress` — live status updates during AI job
- `mt::flowrite:tool-state-updated` — persisted state refresh after tool calls

**Message shape for `runtime-progress`:**
```js
browserWindow.webContents.send('mt::flowrite:runtime-progress', {
  ready: Boolean,
  requestId: String | null,
  status: 'idle' | 'running' | 'completed' | 'failed',
  phase: 'idle' | 'bootstrap' | 'global_comment' | 'margin_comment' | 'ai_review' | 'suggestion_request',
  message: String,
  error: { code: String | null, message: String } | null
})
```

**IPC listeners are registered once** in `LISTEN_FOR_FLOWRITE_RUNTIME` action:
```js
ipcRenderer.on('mt::flowrite:runtime-progress', (event, payload = {}) => {
  dispatch('UPDATE_FLOWRITE_RUNTIME_PROGRESS', payload)
})
```

**IPC handler registration in main** is done in `controller.js` through the `FlowriteController` class — handlers are wired in `app/index.js` (MarkText convention).

## Error Handling Patterns

**Main process errors — always attach `.code`:**
```js
const error = new Error('Flowrite is unavailable for this document right now.')
error.code = availability.reason || 'FLOWRITE_UNAVAILABLE'
throw error
```
Standard error codes: `AI_UNAVAILABLE`, `AI_RUNTIME_EXIT`, `AI_RUNTIME_DISPOSED`, `AI_TOOL_LOOP_LIMIT`, `FLOWRITE_STALE_SUGGESTION`.

**Renderer error display — store the message string in component local state:**
```js
} catch (error) {
  this.submitError = error && error.message
    ? error.message
    : 'Unable to submit this Flowrite comment.'
}
```

**Failed bootstrap — committed to store state, not thrown to caller:**
```js
commit('SET_FLOWRITE_BOOTSTRAP_FAILURE', { pathname, availability, error })
return null  // caller gets null, not a thrown exception
```

**AI runtime errors normalized through `normalizeFlowriteNetworkError`** in `src/main/flowrite/network/status.js` — maps network-level codes (ENOTFOUND, ECONNRESET) to `AI_UNAVAILABLE`.

**Tool errors return to the worker loop, not thrown globally:**
```js
worker.postMessage({
  eventType: 'tool_error',
  payload: { toolUseId, error: { message, code } }
})
```

**Guardrail rejections throw descriptively:**
```js
if (guardedComment.rejected) {
  throw new Error(guardedComment.reason)
}
```

**History persistence failures degrade gracefully** — `historyPersistenceFailed: true` is set on the result, logged via `electron-log`, but the job is considered successful (tool side effects already persisted).

## Logging

**Framework:** `electron-log` (main process only — `import log from 'electron-log'`)

**Patterns:**
- Log errors at `log.error(message, error)` for persistence failures and unexpected states
- No `console.log` in production paths (but ESLint does not ban it — discipline required)
- Renderer components surface errors via local state strings shown in template (`statusMessage`, `submitError`), not console

## Comments

**When to Comment:**
- Block comments above non-obvious logic (e.g., worker message protocol, anchor resolution fallbacks)
- Inline `// TODO: fix these errors someday` in ESLint config for known suppressions
- Comment bodies in prompts use `//` ESLint-style disable comments for Webpack `__non_webpack_require__`

**JSDoc/TSDoc:**
- Not used. No type annotations in Flowrite code.

## Module Design

**Exports:**
- Named exports preferred for utilities: `export const createMarginAnchor`, `export const normalizeCommentBody`
- Default exports for Vue components: `export default { ... }`
- Default exports for class-based modules: `export default FlowriteController`
- Both named and default when the class is the main export but factory functions are also needed: see `anthropicClient.js`

**Barrel Files:**
- Not used in Flowrite additions. Each consumer imports directly from source files.

**Shared constants file:** `src/flowrite/constants.js` is the single source of truth for all string constants shared between main and renderer processes. Always import from here — never hardcode status strings.

---

*Convention analysis: 2026-04-15*

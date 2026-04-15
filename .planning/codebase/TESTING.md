# Testing Patterns

**Analysis Date:** 2026-04-15

## Test Framework

**Unit Runner:**
- Karma + Mocha + Chai, running inside Electron (not jsdom)
- Config: `flowrite-marktext/test/unit/karma.conf.js`
- Framework line: `frameworks: ['mocha', 'chai', 'webpack']`
- Browser: `CustomElectron` launcher with `nodeIntegration: true`, `contextIsolation: false`
- Entry: `test/unit/index.js` which requires all `**/*.spec.js` files

**E2E Runner:**
- Playwright with Electron via custom launcher
- Config: `flowrite-marktext/test/e2e/playwright.config.js`
- Workers: 1 (serial — Electron app is single-instance)
- Helpers: `test/e2e/helpers.js` (`launchElectron`, `closeElectron`)

**Eval Runner (smoke/integration with real API):**
- Mocha with `dotenv/config` and `@babel/register`
- Entry: `test/evals/flowrite-smoke.spec.js`
- Used for live AI gateway validation — requires API keys

**Assertion Library:**
- Chai `expect` style for unit tests
- Playwright `expect` for e2e tests

**Run Commands:**
```bash
# Unit tests (Karma in Electron)
npm --prefix flowrite-marktext run unit

# E2E tests (Playwright + Electron)
npm --prefix flowrite-marktext run e2e

# All tests
npm --prefix flowrite-marktext test

# Flowrite eval/smoke (requires API key env vars)
npm --prefix flowrite-marktext run eval:flowrite
```

## Test File Organization

**Location:**
- Unit specs: `test/unit/specs/` (co-located by feature name, not by source path)
- E2E specs: `test/e2e/`
- Eval specs: `test/evals/`

**Naming:**
- Unit: `flowrite-{feature}.spec.js` — e.g., `flowrite-renderer-store.spec.js`, `flowrite-ai-runtime.spec.js`
- E2E: `flowrite-{feature}.spec.js` — e.g., `flowrite-margin-comments.spec.js`
- Each spec file covers one feature/module boundary

**Structure:**
```
test/
├── unit/
│   ├── karma.conf.js
│   ├── index.js           # auto-requires all spec files
│   └── specs/
│       ├── flowrite-renderer-store.spec.js
│       ├── flowrite-ai-runtime.spec.js
│       ├── flowrite-controller.spec.js
│       ├── flowrite-margin-thread-card.spec.js
│       ├── flowrite-margin-layout.spec.js
│       ├── flowrite-margin-anchors.spec.js
│       ├── flowrite-margin-composer.spec.js
│       ├── flowrite-global-comments.spec.js
│       ├── flowrite-ai-review.spec.js
│       ├── flowrite-ai-review-prompts.spec.js
│       ├── flowrite-storage.spec.js
│       ├── flowrite-suggestions.spec.js
│       └── flowrite-settings.spec.js
├── e2e/
│   ├── playwright.config.js
│   ├── helpers.js
│   ├── flowrite-margin-comments.spec.js
│   ├── flowrite-margin-detached.spec.js
│   ├── flowrite-global-comments.spec.js
│   └── flowrite-ai-review.spec.js
└── evals/
    └── flowrite-smoke.spec.js
```

## Test Structure

**Suite Organization:**
```js
describe('Flowrite renderer store', function () {
  // setup/teardown
  beforeEach(function () { ... })
  afterEach(function () { ... })

  it('bootstraps the current document sidecars and availability into one module', async function () {
    // arrange
    const store = createStore({ ... })
    // act
    await store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', '/notes/draft.md')
    // assert
    expect(store.state.flowrite.pathname).to.equal('/notes/draft.md')
  })
})
```

- `describe` block names start with "Flowrite " and describe the module/component
- `it` descriptions are full human sentences stating the expected behavior
- `async function` (not arrow functions) for all `it` and lifecycle hooks — required by Mocha + Karma

**Patterns:**
- Setup pattern: factory functions (`createStore()`, `mountThreadCard()`) defined at top of each spec file
- Teardown: restore mocked globals in `afterEach`; destroy Vue instances in `finally` blocks
- `flushPromises()` helper used to drain microtask/macrotask queues after async actions triggered by watchers

## Mocking

**Framework:** Manual stubs (no sinon/jest.fn). Replace on the object directly.

**IPC mocking in unit tests — replace `ipcRenderer` methods:**
```js
beforeEach(function () {
  const originalInvoke = ipcRenderer.invoke
  ipcRenderer.invoke = async (channel, payload) => {
    invokeCalls.push({ channel, payload })
    return mockPayload
  }
})
afterEach(function () {
  ipcRenderer.invoke = originalInvoke
})
```

**AI client mocking for runtime tests — stub client module via temp file:**
```js
const clientModulePath = await createStubClientModule('worker-boot-client', `
  module.exports.createAnthropicClient = function createAnthropicClient () {
    return {
      client: {
        messages: {
          create: async function create () {
            return { content: [{ type: 'text', text: 'Ready.' }], stop_reason: 'end_turn' }
          }
        }
      },
      model: 'test-model'
    }
  }
`)
const manager = new FlowriteRuntimeManager({ runtimeConfig: { clientModulePath } })
```

**Worker mocking — pass `createWorker` into `runtimeConfig`:**
```js
const createWorker = () => {
  const worker = new EventEmitter()
  worker.postMessage = message => { /* stub behavior */ }
  worker.terminate = async () => 0
  setTimeout(() => worker.emit('message', { eventType: 'ready' }), 0)
  return worker
}
const manager = new FlowriteRuntimeManager({ runtimeConfig: { createWorker } })
```

**Vue store mocking — construct a real Vuex store with minimal module stubs:**
```js
const createStore = ({ preferences, currentFile } = {}) => {
  return new Vuex.Store({
    modules: {
      editor: { state: { currentFile: currentFile || {} }, mutations: { ... } },
      preferences: { state: createPreferencesState(preferences), mutations: { ... } },
      flowrite: cloneFlowriteModule()
    }
  })
}
```
Never use a fully mocked store — use real Vuex with real Flowrite module state.

**What to mock:**
- `ipcRenderer.invoke`, `ipcRenderer.on`, `ipcRenderer.send`
- Anthropic API client (`messages.create`) via stub client modules
- Worker creation (`createWorker`) for isolation from worker_threads
- `documentStore.saveDocumentRecord` to test failure degradation

**What NOT to mock:**
- Vuex mutations and actions — use real implementations
- `src/flowrite/constants.js` — import directly
- `src/flowrite/anchors/index.js` — use real anchor logic
- File I/O in `documentStore`/`commentsStore` — use real `fs` against a `tmp` directory

## Fixtures and Factories

**Test Data — inline object literals in each test:**
```js
const bootstrapPayload = {
  document: { lastReviewPersona: 'improvement', conversationHistory: [] },
  comments: [{ id: 'comment-1', body: 'Sharpen this opening.' }],
  suggestions: [{ id: 'suggestion-1', status: 'open' }],
  availability: { enabled: true, configured: true, online: true, ... },
  runtimeReady: false
}
```

**Temp directories for file I/O tests:**
```js
beforeEach(async function () {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-ai-runtime-'))
})
afterEach(async function () {
  await fs.remove(tempRoot)
})
```
Always pass `path.join(tempRoot, 'draft.md')` as `documentPath` — never hardcode absolute paths.

**Location:**
- No shared fixtures directory — all test data is inline per-test
- `createPreferencesState()`, `cloneFlowriteModule()` factory functions live at top of each spec file

## Coverage

**Requirements:** No enforced coverage threshold. Coverage reporter is configured (lcov + text-summary) but not gated.

**View Coverage:**
```bash
# Coverage is output after unit test run to test/unit/coverage/
npm --prefix flowrite-marktext run unit
```

## Test Types

**Unit Tests (`test/unit/specs/flowrite-*.spec.js`):**
- Scope: individual modules, Vuex store actions/mutations, Vue component rendering
- Vue component tests use `Vue.extend` + `$mount()` (not Vue Test Utils)
- DOM assertions via native `querySelector` and `dispatchEvent`
- Store tests use real Vuex, mock IPC

**Integration Tests (also unit spec files):**
- `flowrite-ai-runtime.spec.js` is effectively integration — it instantiates `FlowriteRuntimeManager` with a stub client module, exercises the full worker loop including tool call round-trips, and asserts on file system state (document records in tmp dir)
- These run under Karma/Electron because they need Node.js APIs (`worker_threads`, `fs`)

**E2E Tests (`test/e2e/flowrite-*.spec.js`):**
- Scope: full app launch, UI interaction, AI responses via mock client
- Framework: Playwright + Electron (serial, 1 worker)
- Pattern: launch → navigate to file → interact via `page.evaluate` or `page.click` → assert via `data-testid` selectors
- Text selection in editor is done via `page.evaluate` DOM manipulation (see `selectTextInEditor` helper in `flowrite-margin-comments.spec.js`)
- Wait strategy: `page.waitForLoadState('domcontentloaded')` + `page.waitForTimeout(750)` after navigation

**Eval Tests (`test/evals/flowrite-smoke.spec.js`):**
- Scope: real Anthropic API calls via AI gateway
- Not run in CI — manual only, requires environment API key
- Validates end-to-end prompt/tool flow with real model responses

## Common Patterns

**Async Testing:**
```js
it('bootstraps correctly', async function () {
  const store = createStore({ ... })
  await store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', '/notes/draft.md')
  expect(store.state.flowrite.pathname).to.equal('/notes/draft.md')
})
```

**Draining Async Watchers (lifecycle tests):**
```js
const flushPromises = async () => {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

store.commit('SET_EDITOR_CURRENT_FILE', { pathname: '/notes/first.md' })
await flushPromises()
expect(store.state.flowrite.comments).to.deep.equal(...)
```

**Error Testing:**
```js
let error = null
try {
  await manager.runJob({ ... })
} catch (err) {
  error = err
}
expect(error).to.be.an('error')
expect(error.code).to.equal('AI_TOOL_LOOP_LIMIT')
```

**Vue Component DOM Testing:**
```js
const vm = mountThreadCard({ thread: { id: 'thread-0', comments: [...] } })
document.body.appendChild(vm.$el)
try {
  await Vue.nextTick()
  const body = vm.$el.querySelector('[data-testid="flowrite-margin-thread-body"]')
  expect(body).to.not.equal(null)
  expect(body.textContent).to.equal('Keep this flush.')
} finally {
  if (vm.$el && vm.$el.parentNode === document.body) {
    document.body.removeChild(vm.$el)
  }
  vm.$destroy()
}
```
Always clean up DOM and destroy instances in `finally` to avoid test pollution.

**Race Condition Testing — in-flight promise resolution order:**
```js
// Launch two bootstraps, resolve second first
const firstBootstrap = store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', path1)
const secondBootstrap = store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', path1)
pendingResponses[1](newPayload)
await flushPromises()
pendingResponses[0](oldPayload)
await Promise.all([firstBootstrap, secondBootstrap])
expect(store.state.flowrite.comments).to.deep.equal(newPayload.comments)
```

---

*Testing analysis: 2026-04-15*

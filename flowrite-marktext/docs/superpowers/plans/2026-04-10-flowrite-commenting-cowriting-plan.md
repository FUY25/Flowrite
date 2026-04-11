# Flowrite Commenting And Co-Writing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden per-thread commenting/co-writing state, a persisted Flowrite collaboration preference, and comment-format guardrails so Flowrite comments stay collaborator-like while still allowing rewrite escalation when the setting allows it.

**Architecture:** Extend the persisted Flowrite settings with a collaboration preference and extend persisted comment threads with an internal interaction mode. Add a small collaboration-routing layer in main-process Flowrite code that decides whether each thread stays in commenting mode or escalates into co-writing mode, and add comment-output guardrails before `create_comment` payloads are saved. Keep the renderer visually unchanged except for the settings control and a small Discussion spacing polish.

**Tech Stack:** Electron, Vue 2, Vuex, main-process Flowrite controller/runtime, electron-store schema, Mocha/Chai unit tests

---

## File Map

**Create**
- `src/main/flowrite/ai/collaborationRouting.js` - Detect action-seeking intent, resolve thread interaction mode, and expose prompt fragments for commenting vs co-writing.
- `src/main/flowrite/ai/commentGuardrails.js` - Normalize or reject markdown-heavy comment output in comment mode.
- `docs/superpowers/plans/2026-04-10-flowrite-commenting-cowriting-plan.md` - This plan.

**Modify**
- `src/flowrite/constants.js` - Add collaboration-mode and interaction-mode constants.
- `src/main/dataCenter/schema.json` - Persist new Flowrite collaboration setting.
- `src/main/flowrite/settings/flowriteSettings.js` - Default and public Flowrite settings include `collaborationMode`.
- `src/main/flowrite/files/commentsStore.js` - Normalize/persist per-thread `interactionMode`.
- `src/main/flowrite/controller.js` - Resolve thread mode, build prompt instructions, validate `create_comment` payloads, and persist escalations.
- `src/main/flowrite/ai/promptBuilder.js` - Thread collaboration instructions and per-turn prompt context.
- `src/renderer/store/preferences.js` - Expose `flowrite.collaborationMode` to renderer state.
- `src/renderer/prefComponents/general/index.vue` - Add the Flowrite collaboration style setting.
- `src/renderer/prefComponents/general/config.js` - Add select options for the new setting.
- `src/renderer/components/flowrite/GlobalComments.vue` - Add a little more vertical air between title and first thread item.

**Test**
- `test/unit/specs/flowrite-settings.spec.js`
- `test/unit/specs/flowrite-storage.spec.js`
- `test/unit/specs/flowrite-controller.spec.js`
- `test/unit/specs/flowrite-ai-review-prompts.spec.js`
- `test/unit/specs/flowrite-renderer-store.spec.js`
- `test/unit/specs/flowrite-global-comments.spec.js`

### Task 1: Add collaboration constants and persisted Flowrite setting

**Files:**
- Modify: `src/flowrite/constants.js`
- Modify: `src/main/dataCenter/schema.json`
- Modify: `src/main/flowrite/settings/flowriteSettings.js`
- Modify: `src/renderer/store/preferences.js`
- Test: `test/unit/specs/flowrite-settings.spec.js`
- Test: `test/unit/specs/flowrite-renderer-store.spec.js`

- [ ] **Step 1: Write the failing settings tests**

```js
it('defaults Flowrite collaborationMode to comment_only', function () {
  const settings = new FlowriteSettings({
    store: new MemoryStore(),
    safeStorage: createSafeStorage(),
    getOnlineStatus: () => ({ online: true })
  })

  expect(settings.getStoredSettings().collaborationMode).to.equal('comment_only')
  expect(settings.getPublicState().collaborationMode).to.equal('comment_only')
})

it('hydrates collaborationMode into renderer preferences state', async function () {
  const store = createStore({
    preferences: {
      enabled: true,
      configured: true,
      online: true,
      collaborationMode: 'cowriting'
    },
    currentFile: {
      pathname: '/notes/draft.md'
    }
  })

  expect(store.state.preferences.flowrite.collaborationMode).to.equal('cowriting')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite settings|Flowrite renderer store"`

Expected: FAIL with missing `collaborationMode` in Flowrite settings/public state or renderer preferences.

- [ ] **Step 3: Add constants, schema defaults, and public-state plumbing**

```js
// src/flowrite/constants.js
export const FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY = 'comment_only'
export const FLOWRITE_COLLABORATION_MODE_COWRITING = 'cowriting'

export const FLOWRITE_THREAD_MODE_COMMENTING = 'commenting'
export const FLOWRITE_THREAD_MODE_COWRITING = 'cowriting'
```

```js
// src/main/flowrite/settings/flowriteSettings.js
const DEFAULT_FLOWRITE_SETTINGS = Object.freeze({
  enabled: true,
  baseURL: DEFAULT_FLOWRITE_AI_BASE_URL,
  model: DEFAULT_FLOWRITE_MODEL,
  encryptedApiKey: '',
  hasCompletedFirstRun: false,
  collaborationMode: FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY
})

if (updates.collaborationMode === FLOWRITE_COLLABORATION_MODE_COWRITING ||
  updates.collaborationMode === FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY) {
  next.collaborationMode = updates.collaborationMode
}

return {
  enabled: requestedEnabled && configured && networkState.online,
  configured,
  online: networkState.online,
  firstRun: !settings.hasCompletedFirstRun && !configured,
  status,
  reason,
  baseURL: settings.baseURL,
  model: settings.model,
  collaborationMode: settings.collaborationMode
}
```

```js
// src/renderer/store/preferences.js
flowrite: {
  enabled: false,
  configured: false,
  online: true,
  firstRun: true,
  status: 'disabled',
  reason: 'unconfigured',
  baseURL: '',
  model: '',
  collaborationMode: 'comment_only'
}
```

- [ ] **Step 4: Run tests to verify the settings pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite settings|Flowrite renderer store"`

Expected: PASS for the new collaboration-mode tests.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext add \
  src/flowrite/constants.js \
  src/main/dataCenter/schema.json \
  src/main/flowrite/settings/flowriteSettings.js \
  src/renderer/store/preferences.js \
  test/unit/specs/flowrite-settings.spec.js \
  test/unit/specs/flowrite-renderer-store.spec.js
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext commit -m "feat: add flowrite collaboration settings"
```

### Task 2: Persist hidden per-thread interaction mode in comment storage

**Files:**
- Modify: `src/main/flowrite/files/commentsStore.js`
- Test: `test/unit/specs/flowrite-storage.spec.js`

- [ ] **Step 1: Write the failing storage tests**

```js
it('defaults legacy threads to commenting mode during normalization', function () {
  const normalized = normalizeComments([{
    id: 'global-thread',
    scope: 'global',
    comments: [{ id: 'comment-1', author: 'assistant', body: 'hello' }]
  }])

  expect(normalized[0].interactionMode).to.equal('commenting')
})

it('preserves an explicit cowriting interactionMode on save', async function () {
  await saveComments(pathname, [{
    id: 'thread-1',
    scope: 'margin',
    interactionMode: 'cowriting',
    comments: [{ id: 'comment-1', author: 'assistant', body: 'Draft this more directly.' }]
  }])

  const loaded = await loadComments(pathname)
  expect(loaded[0].interactionMode).to.equal('cowriting')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite storage"`

Expected: FAIL because comment threads do not yet expose `interactionMode`.

- [ ] **Step 3: Add thread-mode normalization and persistence**

```js
// src/main/flowrite/files/commentsStore.js
const normalizeInteractionMode = value => {
  return value === FLOWRITE_THREAD_MODE_COWRITING
    ? FLOWRITE_THREAD_MODE_COWRITING
    : FLOWRITE_THREAD_MODE_COMMENTING
}

const createThreadRecord = ({ id, scope, anchor, createdAt, interactionMode }) => ({
  id,
  scope,
  anchor: scope === SCOPE_MARGIN ? cloneMarginAnchor(anchor) : null,
  interactionMode: normalizeInteractionMode(interactionMode),
  status: THREAD_STATUS_OPEN,
  createdAt,
  updatedAt: createdAt,
  comments: []
})

return {
  id: thread.id || (scope === SCOPE_GLOBAL ? FLOWRITE_GLOBAL_THREAD_ID : createId('thread')),
  scope,
  anchor: scope === SCOPE_MARGIN ? cloneMarginAnchor(thread.anchor) : null,
  interactionMode: normalizeInteractionMode(thread.interactionMode),
  status: typeof thread.status === 'string' && thread.status ? thread.status : THREAD_STATUS_OPEN,
  createdAt,
  updatedAt,
  comments
}
```

- [ ] **Step 4: Run tests to verify comment storage passes**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite storage"`

Expected: PASS, including new legacy-normalization and persistence cases.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext add \
  src/main/flowrite/files/commentsStore.js \
  test/unit/specs/flowrite-storage.spec.js
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext commit -m "feat: persist flowrite thread interaction mode"
```

### Task 3: Add collaboration routing and comment guardrails

**Files:**
- Create: `src/main/flowrite/ai/collaborationRouting.js`
- Create: `src/main/flowrite/ai/commentGuardrails.js`
- Modify: `src/main/flowrite/ai/promptBuilder.js`
- Test: `test/unit/specs/flowrite-ai-review-prompts.spec.js`
- Test: `test/unit/specs/flowrite-controller.spec.js`

- [ ] **Step 1: Write the failing routing and guardrail tests**

```js
it('stays in commenting mode when collaborationMode is comment_only', function () {
  const result = resolveThreadInteractionMode({
    collaborationMode: 'comment_only',
    currentThreadMode: 'commenting',
    latestUserMessage: 'Can you rewrite this paragraph?'
  })

  expect(result.nextMode).to.equal('commenting')
  expect(result.escalated).to.equal(false)
})

it('escalates to cowriting when collaborationMode allows it and the user asks for rewrite help', function () {
  const result = resolveThreadInteractionMode({
    collaborationMode: 'cowriting',
    currentThreadMode: 'commenting',
    latestUserMessage: 'Can you rewrite this more directly?'
  })

  expect(result.nextMode).to.equal('cowriting')
  expect(result.escalated).to.equal(true)
})

it('strips heading and bold syntax from comment-mode output', function () {
  const normalized = normalizeCommentBodyForMode({
    interactionMode: 'commenting',
    body: '# Main issue\\n\\nThis is **too broad**.'
  })

  expect(normalized.body).to.equal('Main issue\\n\\nThis is too broad.')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite AI review prompts|Flowrite controller"`

Expected: FAIL because the routing helpers and guardrails do not exist yet.

- [ ] **Step 3: Create the collaboration-routing helper**

```js
// src/main/flowrite/ai/collaborationRouting.js
const ACTION_SEEKING_PATTERNS = [
  /\brewrite\b/i,
  /\brephrase\b/i,
  /\bphrase this\b/i,
  /\bdraft\b/i,
  /\bwrite (?:it|this) out\b/i,
  /\btighter\b/i,
  /\banother wording\b/i
]

export const isActionSeekingMessage = message => {
  return ACTION_SEEKING_PATTERNS.some(pattern => pattern.test(message || ''))
}

export const resolveThreadInteractionMode = ({
  collaborationMode,
  currentThreadMode,
  latestUserMessage
}) => {
  if (collaborationMode !== FLOWRITE_COLLABORATION_MODE_COWRITING) {
    return {
      nextMode: FLOWRITE_THREAD_MODE_COMMENTING,
      escalated: false
    }
  }

  if (currentThreadMode === FLOWRITE_THREAD_MODE_COWRITING) {
    return {
      nextMode: FLOWRITE_THREAD_MODE_COWRITING,
      escalated: false
    }
  }

  return isActionSeekingMessage(latestUserMessage)
    ? { nextMode: FLOWRITE_THREAD_MODE_COWRITING, escalated: true }
    : { nextMode: FLOWRITE_THREAD_MODE_COMMENTING, escalated: false }
}
```

- [ ] **Step 4: Create the comment guardrails helper**

```js
// src/main/flowrite/ai/commentGuardrails.js
const HEADING_LINE = /^\s{0,3}#{1,6}\s+/gm
const BOLD_MARKERS = /(\*\*|__)(.*?)\1/g
const ITALIC_MARKERS = /(^|[^\*])(\*|_)([^*_]+)\2/g
const BLOCKQUOTE_LINE = /^\s*>\s?/gm
const FENCE_BLOCK = /```[\s\S]*?```/g
const TABLE_ROW = /^\|.*\|$/gm

export const normalizeCommentBodyForMode = ({ interactionMode, body }) => {
  if (interactionMode !== FLOWRITE_THREAD_MODE_COMMENTING) {
    return { body }
  }

  let nextBody = (body || '').replace(HEADING_LINE, '')
  nextBody = nextBody.replace(BOLD_MARKERS, '$2')
  nextBody = nextBody.replace(ITALIC_MARKERS, '$1$3')
  nextBody = nextBody.replace(BLOCKQUOTE_LINE, '')
  nextBody = nextBody.replace(FENCE_BLOCK, '')
  nextBody = nextBody.replace(TABLE_ROW, '')

  return {
    body: nextBody.trim()
  }
}
```

- [ ] **Step 5: Extend prompt-builder system instructions**

```js
// src/main/flowrite/ai/promptBuilder.js
const buildCollaborationSystemPrompt = ({ collaborationMode, interactionMode }) => {
  if (interactionMode === FLOWRITE_THREAD_MODE_COWRITING) {
    return `Thread mode: cowriting. Collaboration setting: ${collaborationMode}. You may help draft or rephrase, but prefer propose_suggestion for localized edits.`
  }

  return `Thread mode: commenting. Collaboration setting: ${collaborationMode}. Keep comments comment-native: short paragraphs, bullets, and numbered lists are allowed; headings, bold, italics, tables, blockquotes, and code fences are not allowed.`
}
```

- [ ] **Step 6: Run tests to verify routing helpers and prompt rules pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite AI review prompts|Flowrite controller"`

Expected: PASS for the new routing/guardrail cases.

- [ ] **Step 7: Commit**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext add \
  src/main/flowrite/ai/collaborationRouting.js \
  src/main/flowrite/ai/commentGuardrails.js \
  src/main/flowrite/ai/promptBuilder.js \
  test/unit/specs/flowrite-ai-review-prompts.spec.js \
  test/unit/specs/flowrite-controller.spec.js
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext commit -m "feat: add flowrite collaboration routing"
```

### Task 4: Integrate hidden thread-mode routing into the Flowrite controller

**Files:**
- Modify: `src/main/flowrite/controller.js`
- Modify: `src/main/flowrite/files/commentsStore.js`
- Test: `test/unit/specs/flowrite-controller.spec.js`

- [ ] **Step 1: Write the failing controller integration tests**

```js
it('escalates a global thread to cowriting when collaborationMode allows rewrite intent', async function () {
  const controller = createControllerWithSettings({
    collaborationMode: 'cowriting'
  })

  await controller.submitGlobalComment({
    pathname: '/tmp/draft.md',
    markdown: 'Draft text',
    body: 'Can you rewrite this ending?'
  })

  const comments = await loadComments('/tmp/draft.md')
  expect(comments[0].interactionMode).to.equal('cowriting')
})

it('normalizes comment-mode create_comment tool payloads before persistence', async function () {
  const controller = createControllerWithToolSpy()

  await controller.executeToolCall({
    name: 'create_comment',
    documentPath: '/tmp/draft.md',
    input: {
      threadId: 'global-thread',
      scope: 'global',
      interactionMode: 'commenting',
      body: '# Main issue\\n\\n**Too broad**'
    }
  })

  const comments = await loadComments('/tmp/draft.md')
  expect(comments[0].comments[0].body).to.equal('Main issue\\n\\nToo broad')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite controller"`

Expected: FAIL because controller paths do not yet compute or persist thread interaction mode.

- [ ] **Step 3: Thread the new mode through comment submission and tool execution**

```js
// src/main/flowrite/controller.js
const collaborationMode = this.flowriteSettings.getStoredSettings().collaborationMode
const existingThread = pathname ? (await loadComments(pathname)).find(thread => thread.id === FLOWRITE_GLOBAL_THREAD_ID) : null
const { nextMode } = resolveThreadInteractionMode({
  collaborationMode,
  currentThreadMode: existingThread ? existingThread.interactionMode : FLOWRITE_THREAD_MODE_COMMENTING,
  latestUserMessage: trimmedBody
})

await appendCommentToThread(pathname, {
  threadId: FLOWRITE_GLOBAL_THREAD_ID,
  scope: SCOPE_GLOBAL,
  author: AUTHOR_USER,
  body: trimmedBody,
  interactionMode: nextMode
})
```

```js
// src/main/flowrite/controller.js executeToolCall
if (name === 'create_comment') {
  const normalized = normalizeCommentBodyForMode({
    interactionMode: input.interactionMode || FLOWRITE_THREAD_MODE_COMMENTING,
    body: input.body
  })

  const { thread, comment } = await appendCommentToThread(documentPath, {
    threadId: input.threadId,
    scope: input.scope,
    anchor: input.anchor,
    author: AUTHOR_ASSISTANT,
    body: normalized.body,
    interactionMode: input.interactionMode
  })
}
```

- [ ] **Step 4: Add explicit prompt context per thread mode**

```js
// src/main/flowrite/controller.js
prompt: this.buildGlobalCommentPrompt({
  body: trimmedBody,
  interactionMode: nextMode,
  collaborationMode
})
```

```js
// buildGlobalCommentPrompt
return [
  'The writer added a new global comment in the bottom discussion area.',
  `Thread interaction mode: ${interactionMode}.`,
  `Collaboration preference: ${collaborationMode}.`,
  `Writer comment: ${body}`,
  `Reply in the existing global discussion thread using threadId "${FLOWRITE_GLOBAL_THREAD_ID}".`,
  'Use create_comment with scope "global" and include interactionMode matching the thread.'
].join('\n\n')
```

- [ ] **Step 5: Run controller tests to verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite controller"`

Expected: PASS for escalation, persistence, and comment-guardrail cases.

- [ ] **Step 6: Commit**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext add \
  src/main/flowrite/controller.js \
  src/main/flowrite/files/commentsStore.js \
  test/unit/specs/flowrite-controller.spec.js
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext commit -m "feat: route flowrite threads between commenting and cowriting"
```

### Task 5: Add the settings control in Preferences

**Files:**
- Modify: `src/renderer/prefComponents/general/config.js`
- Modify: `src/renderer/prefComponents/general/index.vue`
- Modify: `src/renderer/store/preferences.js`
- Test: `test/unit/specs/flowrite-renderer-store.spec.js`

- [ ] **Step 1: Write the failing renderer test**

```js
it('keeps the Flowrite collaboration preference in renderer preferences state', function () {
  const store = createStore({
    preferences: {
      collaborationMode: 'cowriting'
    }
  })

  expect(store.state.preferences.flowrite.collaborationMode).to.equal('cowriting')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite renderer store"`

Expected: FAIL if the renderer preference state does not surface `collaborationMode` correctly.

- [ ] **Step 3: Add the settings option to General preferences**

```js
// src/renderer/prefComponents/general/config.js
export const flowriteCollaborationOptions = [{
  label: 'Comment only',
  value: 'comment_only'
}, {
  label: 'Co-writing',
  value: 'cowriting'
}]
```

```vue
<!-- src/renderer/prefComponents/general/index.vue -->
<compound>
  <template #head>
    <h6 class="title">Flowrite:</h6>
  </template>
  <template #children>
    <cur-select
      description="Flowrite collaboration style"
      notes="Comment only keeps Flowrite reflective. Co-writing allows Flowrite to draft when your reply asks for action."
      :value="flowriteCollaborationMode"
      :options="flowriteCollaborationOptions"
      :onChange="value => onFlowriteChange(value)"
    ></cur-select>
  </template>
</compound>
```

```js
// methods
onFlowriteChange (value) {
  this.$store.dispatch('SET_USER_DATA', {
    type: 'flowrite',
    value: {
      ...this.$store.state.preferences.flowrite,
      collaborationMode: value
    }
  })
}
```

- [ ] **Step 4: Run tests to verify renderer preferences pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite renderer store"`

Expected: PASS, with renderer preference state and update path working.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext add \
  src/renderer/prefComponents/general/config.js \
  src/renderer/prefComponents/general/index.vue \
  src/renderer/store/preferences.js \
  test/unit/specs/flowrite-renderer-store.spec.js
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext commit -m "feat: expose flowrite collaboration mode in settings"
```

### Task 6: Polish Discussion spacing without changing the margin UI redesign scope

**Files:**
- Modify: `src/renderer/components/flowrite/GlobalComments.vue`
- Test: `test/unit/specs/flowrite-global-comments.spec.js`

- [ ] **Step 1: Write the failing spacing-oriented component assertion**

```js
it('adds breathing room between the Discussion title and the first comment', async function () {
  const store = createStore()
  store.state.flowrite.comments = [{
    id: 'global-thread',
    scope: 'global',
    comments: [{
      id: 'comment-1',
      author: 'assistant',
      body: 'A thoughtful note.',
      createdAt: new Date().toISOString()
    }]
  }]

  const vm = mountGlobalComments(store)
  const header = vm.$el.querySelector('.flowrite-global-comments__header')

  expect(window.getComputedStyle(header).marginBottom).to.equal('20px')

  vm.$destroy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite global comments"`

Expected: FAIL because the title/comment spacing is still tighter than the new target.

- [ ] **Step 3: Increase the Discussion vertical rhythm**

```css
/* src/renderer/components/flowrite/GlobalComments.vue */
.flowrite-global-comments__header {
  margin-bottom: 20px;
}

.flowrite-global-comments__thread {
  gap: 18px;
}

.flowrite-global-comments__comment {
  align-items: flex-start;
}
```

- [ ] **Step 4: Run the Discussion tests to verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite global comments"`

Expected: PASS, with the extra air in Discussion and no unrelated margin-comment UI redesign.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext add \
  src/renderer/components/flowrite/GlobalComments.vue \
  test/unit/specs/flowrite-global-comments.spec.js
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext commit -m "style: loosen flowrite discussion spacing"
```

### Task 7: Run the focused verification sweep

**Files:**
- Modify: none
- Test: `test/unit/specs/flowrite-settings.spec.js`
- Test: `test/unit/specs/flowrite-storage.spec.js`
- Test: `test/unit/specs/flowrite-controller.spec.js`
- Test: `test/unit/specs/flowrite-ai-review-prompts.spec.js`
- Test: `test/unit/specs/flowrite-renderer-store.spec.js`
- Test: `test/unit/specs/flowrite-global-comments.spec.js`

- [ ] **Step 1: Run the focused Flowrite unit suite**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run unit -- --grep "Flowrite settings|Flowrite storage|Flowrite controller|Flowrite AI review prompts|Flowrite renderer store|Flowrite global comments"`

Expected: PASS for all updated Flowrite behavior and renderer tests.

- [ ] **Step 2: Run renderer packaging**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run pack:renderer`

Expected: PASS with no build errors.

- [ ] **Step 3: Run main-process packaging**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npm_config_cache=/tmp/flowrite-npm-cache npx -y yarn@1.22.22 run pack:main`

Expected: PASS with no build errors.

- [ ] **Step 4: Commit the verification checkpoint if needed**

```bash
git -C /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext status --short
```

Expected: no new unstaged code changes other than intentional test snapshots or lockfile updates.

## Self-Review

### Spec coverage

- collaboration setting in software preferences: covered by Tasks 1 and 5
- hidden per-thread interaction mode: covered by Tasks 2 and 4
- comment guardrails for headings/emphasis/etc.: covered by Task 3
- escalation from commenting to co-writing only when allowed: covered by Tasks 3 and 4
- same visual UI with behavior-only distinction: preserved across Tasks 4 and 5
- discussion spacing polish and no deeper margin-UI redesign in this phase: covered by Task 6

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain
- Each code-changing task includes concrete file paths, code snippets, and verification commands

### Type consistency

- Flowrite setting values use `comment_only` and `cowriting`
- thread interaction values use `commenting` and `cowriting`
- routing helper consistently uses `resolveThreadInteractionMode`
- guardrail helper consistently uses `normalizeCommentBodyForMode`


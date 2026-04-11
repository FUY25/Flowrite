# Flowrite Margin Comment UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current pane-list margin comments with a true margin-native commenting system: always-visible dots, interaction-only underlines, multi-paragraph anchors, anchor-positioned cards, inline reply flow, UI-only thread deletion, and crowding-aware auto-compression.

**Architecture:** Keep the existing Flowrite persistence model (`comments` array of threads with `comments` messages) and extend the existing anchor object instead of migrating storage. Build the new rail in two internal phases: first ship a real anchor-aware margin rail with multi-paragraph selection support and comment-only workflows, then add the crowding/compression engine that preserves readability when many threads overlap. Creation still starts from Muya’s selection affordance, but the temporary popover is replaced by an anchored composer card inside the real margin rail.

**Tech Stack:** Electron, Vue 2 single-file components, Vuex, Muya editor plugins, Flowrite main-process controller/IPC, Mocha + Chai unit tests, Playwright Electron e2e tests.

---

## File Map

### Existing files to modify

- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/flowrite/anchors/index.js`
  - Extend the anchor resolver from single-paragraph-only attachment to multi-paragraph ranges while keeping the current `start`/`end` storage shape.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/main/flowrite/controller.js`
  - Remove the cross-paragraph rejection, preserve comment-only prompt behavior, and add a UI-only delete-thread IPC path.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/main/flowrite/files/commentsStore.js`
  - Add delete-thread persistence using the existing thread array model.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
  - Track active margin thread, composer thread, highlighted anchors, delete action, and rail-open behavior.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
  - Remove the temporary margin popover flow, mount gutter/highlight/rail pieces, and connect Muya selection events to the new composer card.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
  - Stop rendering a simple updated-at list; become the orchestrator for positioned cards.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
  - Rename the action to `Ask Flowrite`, allow multi-paragraph selection payloads, and keep the entry point consistent with Muya’s existing selection UI.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/Toolbar.vue`
  - Update the annotation toggle label/tooltip text if needed to match the new margin behavior.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/layout.js`
  - Add the “auto-collapse left sidebar when the rail would make writing width uncomfortable” state transition.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-anchors.spec.js`
  - Expand anchor coverage to cross-paragraph resolution and detached behavior across ranges.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-controller.spec.js`
  - Replace the single-paragraph rejection expectation and add delete-thread controller coverage.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`
  - Add delete-thread persistence coverage without changing AI context/document storage.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-renderer-store.spec.js`
  - Add store-level coverage for composer thread state, active thread state, and rail auto-open behavior.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
  - Replace popover-era expectations with margin-rail composer behavior.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js`
  - Keep detached-thread behavior working with the new rail and highlight model.

### New files to create

- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue`
  - Render always-visible gutter dots for all attached/detached margin threads, even when the rail is hidden.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginAnchorHighlights.vue`
  - Render muted underlines only for active/hovered/composing threads.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue`
  - Render one anchored thread card with compressed/expanded display, reply input, and UI-only thread delete.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/marginLayout.js`
  - Pure helper that computes natural top positions, push-down stacking, crowding regions, and auto-compression.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js`
  - Unit coverage for the pure layout/crowding helper.

## Product Decisions Locked In

- Dots are always visible, whether the rail is open or hidden.
- Underlines only appear on interaction: hover, active thread, or while composing.
- Margin comments support multi-paragraph selections.
- Multiple threads can overlap the same or nearby text.
- Creation starts only from Muya’s selection affordance and is labeled `Ask Flowrite`.
- The rail is a true annotation surface aligned to anchors, not a generic thread list.
- Implement the full crowding solution, but in a second internal phase after the core rail works.
- Thread delete is display-layer only and must not mutate AI conversation history.
- Keep the current comments storage model unless a small additive field is necessary.
- Explicitly out of scope for this plan:
  - suggestion / rewrite UI changes
  - compose blocks
  - small-window popover mode below 750px
  - soft-locking anchor text while AI streams
  - manual re-attach
  - per-message delete and undo stack integration

## Task 1: Extend The Anchor Model To Support Multi-Paragraph Threads

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/flowrite/anchors/index.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/main/flowrite/controller.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-anchors.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-controller.spec.js`

- [ ] **Step 1: Write the failing multi-paragraph anchor resolver test**

```js
it('resolves a multi-paragraph anchor into a range that spans the start and end paragraphs', function () {
  const anchor = createMarginAnchor({
    start: { key: 'ag-1', offset: 6 },
    end: { key: 'ag-2', offset: 11 },
    quote: 'first paragraph tail second para',
    startBlockText: 'Alpha first paragraph tail',
    endBlockText: 'second para closes here'
  })

  const resolution = resolveMarginAnchor(anchor, [
    { id: 'ag-1', text: 'Alpha first paragraph tail' },
    { id: 'ag-2', text: 'second para closes here' }
  ])

  expect(resolution.status).to.equal(ANCHOR_ATTACHED)
  expect(resolution.startParagraphId).to.equal('ag-1')
  expect(resolution.endParagraphId).to.equal('ag-2')
  expect(resolution.ranges).to.deep.equal([
    { paragraphId: 'ag-1', startOffset: 6, endOffset: 26 },
    { paragraphId: 'ag-2', startOffset: 0, endOffset: 11 }
  ])
})
```

- [ ] **Step 2: Run the focused anchor test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "multi-paragraph anchor"`

Expected: FAIL because `resolveMarginAnchor` only returns the single-paragraph shape today.

- [ ] **Step 3: Write the failing controller test that removes the single-paragraph restriction**

```js
it('accepts a cross-paragraph margin comment anchor and forwards it to storage', async function () {
  await controller.submitMarginComment({
    browserWindow,
    pathname: '/tmp/doc.md',
    markdown: 'Alpha\n\nBeta',
    body: 'Ask about both paragraphs.',
    anchor: {
      quote: 'Alpha Beta',
      start: { key: 'ag-1', offset: 0 },
      end: { key: 'ag-2', offset: 4 }
    }
  })

  expect(appendCommentToThreadStub.calledOnce).to.equal(true)
})
```

- [ ] **Step 4: Run the focused controller test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "cross-paragraph margin comment"`

Expected: FAIL with `Flowrite margin comments currently support single-paragraph selections only.`

- [ ] **Step 5: Implement the minimal anchor and controller changes**

```js
const createAttachedResolution = ({
  startParagraphId,
  endParagraphId,
  ranges,
  strategy,
  score = 1
}) => ({
  status: ANCHOR_ATTACHED,
  startParagraphId,
  endParagraphId,
  paragraphId: startParagraphId,
  ranges,
  strategy,
  score
})

const resolvePrimaryAnchor = (anchor, snapshot) => {
  const startIndex = snapshot.entries.findIndex(entry => entry.id === anchor.start.key)
  const endIndex = snapshot.entries.findIndex(entry => entry.id === anchor.end.key)
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return null

  const ranges = snapshot.entries.slice(startIndex, endIndex + 1).map((paragraph, index, entries) => ({
    paragraphId: paragraph.id,
    startOffset: index === 0 ? clamp(anchor.start.offset, 0, paragraph.text.length) : 0,
    endOffset: index === entries.length - 1
      ? clamp(anchor.end.offset, 0, paragraph.text.length)
      : paragraph.text.length
  }))

  return createAttachedResolution({
    startParagraphId: ranges[0].paragraphId,
    endParagraphId: ranges[ranges.length - 1].paragraphId,
    ranges,
    strategy: 'primary'
  })
}
```

```js
if (!anchor || !anchor.quote || !anchor.start || !anchor.end) {
  throw new Error('Flowrite margin comments require a valid text selection anchor.')
}
```

- [ ] **Step 6: Run the focused unit tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "multi-paragraph anchor|cross-paragraph margin comment"`

Expected: PASS with the new multi-paragraph assertions green.

- [ ] **Step 7: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/flowrite/anchors/index.js src/main/flowrite/controller.js test/unit/specs/flowrite-margin-anchors.spec.js test/unit/specs/flowrite-controller.spec.js
git commit -m "feat: support multi-paragraph flowrite anchors"
```

## Task 2: Add UI-Only Thread Deletion On The Existing Data Model

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/main/flowrite/files/commentsStore.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/main/flowrite/controller.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-controller.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-renderer-store.spec.js`

- [ ] **Step 1: Write the failing storage test for deleting a margin thread without touching document context**

```js
it('deletes only the requested margin thread from comments storage', async function () {
  await saveComments(pathname, [
    { id: 'global-thread', scope: 'global', comments: [{ id: 'g1', author: 'user', body: 'Keep me.' }] },
    { id: 'thread_a', scope: 'margin', comments: [{ id: 'a1', author: 'user', body: 'Delete me.' }] }
  ])

  const comments = await deleteCommentThread(pathname, 'thread_a')

  expect(comments.map(thread => thread.id)).to.deep.equal(['global-thread'])
})
```

- [ ] **Step 2: Run the storage test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "deletes only the requested margin thread"`

Expected: FAIL because `deleteCommentThread` does not exist.

- [ ] **Step 3: Implement minimal delete-thread persistence and IPC**

```js
export const deleteCommentThread = async (pathname, threadId) => {
  const comments = await loadComments(pathname)
  const nextComments = comments.filter(thread => thread.id !== threadId)
  await saveComments(pathname, nextComments)
  return nextComments
}
```

```js
async deleteCommentThread ({ browserWindow, pathname, threadId } = {}) {
  if (!pathname || !threadId) {
    throw new Error('Deleting a Flowrite thread requires a pathname and threadId.')
  }

  const comments = await deleteCommentThread(pathname, threadId)
  await this.sendPersistedRefresh(browserWindow, pathname)
  return comments
}
```

- [ ] **Step 4: Add the renderer store action and focused tests**

```js
async DELETE_MARGIN_THREAD ({ rootState, dispatch }, threadId) {
  const currentFile = rootState.editor && rootState.editor.currentFile ? rootState.editor.currentFile : {}
  const pathname = currentFile.pathname || ''
  if (!pathname) throw new Error('Save this document before deleting a Flowrite thread.')

  const comments = await ipcRenderer.invoke('mt::flowrite:delete-comment-thread', {
    pathname,
    threadId
  })

  dispatch('APPLY_FLOWRITE_THREAD_REFRESH', { comments })
  return comments
}
```

- [ ] **Step 5: Run the focused unit tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "deletes only the requested margin thread|delete-comment-thread|DELETE_MARGIN_THREAD"`

Expected: PASS with storage, controller, and store coverage green.

- [ ] **Step 6: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/main/flowrite/files/commentsStore.js src/main/flowrite/controller.js src/renderer/store/modules/flowrite.js test/unit/specs/flowrite-storage.spec.js test/unit/specs/flowrite-controller.spec.js test/unit/specs/flowrite-renderer-store.spec.js
git commit -m "feat: add ui-only flowrite thread deletion"
```

## Task 3: Replace The Selection Popover With `Ask Flowrite` Composer Threads

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Delete: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadPopover.vue`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-renderer-store.spec.js`

- [ ] **Step 1: Update the e2e test to expect an anchored composer card instead of the popover**

```js
await expect(page.locator('[data-testid="flowrite-selection-comment-button"]')).toContainText('Ask Flowrite')
await page.locator('[data-testid="flowrite-selection-comment-button"]').click()

const composer = page.locator('[data-testid="flowrite-margin-thread-composer"]').first()
await expect(composer).toBeVisible()
await composer.locator('textarea').fill('Can you sharpen this image?')
await composer.locator('[data-testid="flowrite-margin-thread-submit"]').click()
```

- [ ] **Step 2: Run the e2e spec and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: FAIL because the current UI still shows `Comment` and the popover component.

- [ ] **Step 3: Add store state for an in-progress composer thread**

```js
export const createDefaultFlowriteState = () => ({
  pathname: '',
  comments: [],
  suggestions: [],
  showAnnotationsPane: false,
  activeMarginThreadId: null,
  composerMarginThread: null,
  highlightedMarginThreadIds: [],
  inFlightAnchors: [],
  // ...
})
```

```js
SET_MARGIN_THREAD_COMPOSER (state, payload) {
  state.composerMarginThread = payload
  if (payload) {
    state.showAnnotationsPane = true
    state.activeMarginThreadId = payload.id
    state.highlightedMarginThreadIds = [payload.id]
  }
}
```

- [ ] **Step 4: Replace the selection click handler with `Ask Flowrite` composer creation**

```js
this.button.textContent = 'Ask Flowrite'
```

```js
openMarginComposer (selectionPayload = {}) {
  const anchor = createMarginAnchor({
    start: selectionPayload.start,
    end: selectionPayload.end,
    quote: selectionPayload.quote,
    startBlockText: selectionPayload.start ? selectionPayload.start.blockText : '',
    endBlockText: selectionPayload.end ? selectionPayload.end.blockText : ''
  })

  if (!anchor) return

  this.$store.dispatch('OPEN_MARGIN_THREAD_COMPOSER', { anchor })
}
```

- [ ] **Step 5: Remove the temporary popover wiring from the editor shell**

```vue
<margin-comment-layer
  v-if="!sourceCode"
  :editor-root="$el"
></margin-comment-layer>
```

```js
this.editor.eventCenter.subscribe('flowrite-selection-comment', selectionPayload => {
  this.openMarginComposer(selectionPayload)
})
```

- [ ] **Step 6: Run the focused tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "composerMarginThread|Ask Flowrite" && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: PASS with the new `Ask Flowrite` flow and no popover references left.

- [ ] **Step 7: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/muya/lib/ui/flowriteSelectionMenu/index.js src/renderer/components/editorWithTabs/editor.vue src/renderer/store/modules/flowrite.js test/e2e/flowrite-margin-comments.spec.js test/unit/specs/flowrite-renderer-store.spec.js
git rm src/renderer/components/flowrite/MarginThreadPopover.vue
git commit -m "feat: open flowrite margin threads in the rail"
```

## Task 4: Add Persistent Dots And Interaction-Only Underlines

**Files:**
- Create: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue`
- Create: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginAnchorHighlights.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js`

- [ ] **Step 1: Write the failing e2e expectation for dots staying visible when the rail is hidden**

```js
await page.locator('[data-testid="flowrite-annotations-toggle"]').click()
await expect(page.locator('[data-testid="flowrite-margin-dot"]').first()).toBeVisible()
await expect(page.locator('[data-testid="flowrite-margin-thread"]').first()).toBeHidden()
```

- [ ] **Step 2: Run the e2e specs and verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js`

Expected: FAIL because dots do not exist independently of the rail yet.

- [ ] **Step 3: Add pure dot and highlight components**

```vue
<button
  v-for="thread in resolvedThreads"
  :key="thread.id"
  class="flowrite-margin-dot"
  :style="{ top: `${thread.dotTop}px` }"
  data-testid="flowrite-margin-dot"
  @click="$emit('activate-thread', thread.id)"
></button>
```

```vue
<div
  v-for="range in visibleRanges"
  :key="`${range.threadId}:${range.paragraphId}:${range.startOffset}`"
  class="flowrite-margin-highlight"
  :class="{ 'is-detached': range.detached }"
  :style="range.style"
></div>
```

- [ ] **Step 4: Mount dots and highlights in the editor shell**

```vue
<div class="editor-main">
  <div ref="editor" class="editor-component"></div>
  <margin-anchor-highlights
    v-if="!sourceCode"
    :editor-root="$el"
  ></margin-anchor-highlights>
  <margin-comment-dots
    v-if="!sourceCode"
    :editor-root="$el"
  ></margin-comment-dots>
</div>
```

- [ ] **Step 5: Tie dot clicks to rail activation and underline state**

```js
ACTIVATE_MARGIN_THREAD ({ commit }, threadId) {
  commit('SET_ACTIVE_MARGIN_THREAD', threadId)
  commit('SET_MARGIN_THREAD_HIGHLIGHTS', [threadId])
  commit('SET_FLOWRITE_ANNOTATIONS_PANE', true)
}
```

- [ ] **Step 6: Run the e2e specs and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js`

Expected: PASS with visible dots in both states and underline behavior attached to interaction.

- [ ] **Step 7: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/renderer/components/flowrite/MarginCommentDots.vue src/renderer/components/flowrite/MarginAnchorHighlights.vue src/renderer/components/editorWithTabs/editor.vue src/renderer/store/modules/flowrite.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js
git commit -m "feat: add flowrite margin dots and anchor highlights"
```

## Task 5: Build The First Margin-Native Rail With Anchor-Positioned Cards

**Files:**
- Create: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue`
- Create: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/marginLayout.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Write the failing pure layout helper test for anchor ordering**

```js
it('orders threads by anchor position rather than updatedAt', function () {
  const layout = buildMarginLayout([
    { id: 'late', naturalTop: 320, height: 120 },
    { id: 'early', naturalTop: 120, height: 120 }
  ])

  expect(layout.map(item => item.id)).to.deep.equal(['early', 'late'])
})
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "orders threads by anchor position"`

Expected: FAIL because `buildMarginLayout` does not exist.

- [ ] **Step 3: Create the minimal layout helper**

```js
export const buildMarginLayout = (threads, gap = 8) => {
  return threads
    .slice()
    .sort((left, right) => left.naturalTop - right.naturalTop)
    .reduce((result, thread) => {
      const previous = result[result.length - 1]
      const top = previous
        ? Math.max(thread.naturalTop, previous.top + previous.height + gap)
        : thread.naturalTop

      result.push({ ...thread, top })
      return result
    }, [])
}
```

- [ ] **Step 4: Replace the current updated-at list rendering with positioned thread cards**

```vue
<div class="flowrite-annotations__rail">
  <margin-thread-card
    v-for="thread in positionedThreads"
    :key="thread.id"
    :thread="thread"
    :style="{ top: `${thread.top}px` }"
    data-testid="flowrite-margin-thread"
    @focus-thread="$emit('focus-thread', thread.id)"
    @reply="replyToThread"
    @delete-thread="deleteThread"
  ></margin-thread-card>
</div>
```

- [ ] **Step 5: Run the helper unit test and the margin e2e spec**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "orders threads by anchor position" && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: PASS with cards aligned by anchor order instead of updated time.

- [ ] **Step 6: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/renderer/components/flowrite/MarginThreadCard.vue src/renderer/components/flowrite/marginLayout.js src/renderer/components/flowrite/MarginCommentLayer.vue src/renderer/components/editorWithTabs/editor.vue test/unit/specs/flowrite-margin-layout.spec.js test/e2e/flowrite-margin-comments.spec.js
git commit -m "feat: anchor flowrite margin threads to document position"
```

## Task 6: Add Reply Flow And Comment-Only Thread Anatomy

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/main/flowrite/controller.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Extend the e2e flow to reply inside an existing thread**

```js
await page.locator('[data-testid="flowrite-margin-thread"]').first().click()
await page.locator('[data-testid="flowrite-margin-thread-reply-input"]').fill('Push this thought a little further.')
await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Enter`)
await expect(page.locator('[data-testid="flowrite-margin-thread"]').first()).toContainText('Push this thought a little further.')
```

- [ ] **Step 2: Run the e2e spec and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: FAIL because the current thread card has no reply input.

- [ ] **Step 3: Add reply-input rendering that only appears on the active thread**

```vue
<textarea
  v-if="isActive"
  v-model="replyDraft"
  class="flowrite-margin-thread__reply"
  data-testid="flowrite-margin-thread-reply-input"
  placeholder="Reply..."
  @keydown.meta.enter.prevent="submitReply"
  @keydown.ctrl.enter.prevent="submitReply"
></textarea>
```

```js
submitReply () {
  const body = this.replyDraft.trim()
  if (!body) return
  this.$emit('reply', { threadId: this.thread.id, body })
  this.replyDraft = ''
}
```

- [ ] **Step 4: Route replies through the existing comment controller path**

```js
async REPLY_TO_MARGIN_THREAD ({ rootState }, { threadId, body, anchor }) {
  const currentFile = rootState.editor && rootState.editor.currentFile ? rootState.editor.currentFile : {}
  return ipcRenderer.invoke('mt::flowrite:submit-margin-comment', {
    pathname: currentFile.pathname || '',
    markdown: typeof currentFile.markdown === 'string' ? currentFile.markdown : '',
    body,
    anchor,
    threadId
  })
}
```

- [ ] **Step 5: Run the e2e spec and verify it passes**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: PASS with reply-in-thread behavior and no suggestion controls.

- [ ] **Step 6: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/renderer/components/flowrite/MarginThreadCard.vue src/renderer/store/modules/flowrite.js src/main/flowrite/controller.js test/e2e/flowrite-margin-comments.spec.js
git commit -m "feat: support flowrite margin thread replies"
```

## Task 7: Add Crowding Detection, Auto-Compression, And Overlap Support

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/marginLayout.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Write the failing crowding helper test**

```js
it('auto-compresses crowded threads when push-down drift exceeds the threshold', function () {
  const layout = buildMarginLayout([
    { id: 'a', naturalTop: 120, height: 180, messageCount: 3 },
    { id: 'b', naturalTop: 170, height: 180, messageCount: 5 },
    { id: 'c', naturalTop: 220, height: 180, messageCount: 2 }
  ], { compressionDriftThreshold: 80 })

  expect(layout.find(item => item.id === 'b').collapsed).to.equal(true)
  expect(layout.find(item => item.id === 'c').collapsed).to.equal(true)
})
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "auto-compresses crowded threads"`

Expected: FAIL because the helper does not compute crowding/compression yet.

- [ ] **Step 3: Extend the layout helper with crowding-region compression**

```js
export const buildMarginLayout = (threads, options = {}) => {
  const gap = options.gap || 8
  const compressionDriftThreshold = options.compressionDriftThreshold || 80
  const laidOut = []

  for (const thread of threads.slice().sort((left, right) => left.naturalTop - right.naturalTop)) {
    const previous = laidOut[laidOut.length - 1]
    const top = previous ? Math.max(thread.naturalTop, previous.top + previous.height + gap) : thread.naturalTop
    const drift = top - thread.naturalTop

    laidOut.push({
      ...thread,
      top,
      drift,
      collapsed: drift >= compressionDriftThreshold || thread.messageCount >= 4
    })
  }

  return laidOut
}
```

- [ ] **Step 4: Render compressed thread bodies with a fold link**

```vue
<button
  v-if="thread.collapsed && hiddenReplyCount > 0"
  type="button"
  class="flowrite-margin-thread__fold"
  @click="expanded = !expanded"
>
  {{ expanded ? 'Collapse replies' : `Show ${hiddenReplyCount} replies` }}
</button>
```

- [ ] **Step 5: Run the unit and e2e coverage and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "auto-compresses crowded threads|orders threads by anchor position" && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: PASS with overlapping threads rendered in stable order and compressed when crowded.

- [ ] **Step 6: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/renderer/components/flowrite/marginLayout.js src/renderer/components/flowrite/MarginThreadCard.vue src/renderer/components/flowrite/MarginCommentLayer.vue test/unit/specs/flowrite-margin-layout.spec.js test/e2e/flowrite-margin-comments.spec.js
git commit -m "feat: compress crowded flowrite margin threads"
```

## Task 8: Integrate Rail Width, Sidebar Auto-Collapse, And Desktop Width Rules

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/layout.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/Toolbar.vue`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/layout-store.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Write the failing layout-store test for sidebar auto-collapse when the rail opens**

```js
it('auto-collapses the left sidebar when annotations would squeeze the writing width below the threshold', function () {
  const localState = {
    showSideBar: true,
    sideBarWidth: 280,
    sideBarLiveWidth: null,
    distractionFreeWriting: false
  }

  mutations.SET_LAYOUT(localState, {
    showSideBar: true,
    marginRailWidth: 280,
    viewportWidth: 1040
  })

  expect(localState.showSideBar).to.equal(false)
})
```

- [ ] **Step 2: Run the layout test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "auto-collapses the left sidebar"`

Expected: FAIL because the layout store does not know about annotation-width pressure yet.

- [ ] **Step 3: Implement the width policy**

```js
const MIN_COMFORTABLE_WRITING_WIDTH = 720
const DEFAULT_MARGIN_RAIL_WIDTH = 280
const MIN_MARGIN_RAIL_WIDTH = 248
```

```js
OPEN_FLOWRITE_ANNOTATIONS_PANE ({ commit, rootState }) {
  const viewportWidth = window.innerWidth
  const sideBarWidth = rootState.layout.showSideBar ? rootState.layout.sideBarWidth : 0
  const effectiveRailWidth = viewportWidth < 900 ? MIN_MARGIN_RAIL_WIDTH : DEFAULT_MARGIN_RAIL_WIDTH

  if (viewportWidth - sideBarWidth - effectiveRailWidth < MIN_COMFORTABLE_WRITING_WIDTH) {
    commit('SET_LAYOUT', { showSideBar: false })
  }

  commit('SET_FLOWRITE_ANNOTATIONS_PANE', true)
}
```

- [ ] **Step 4: Use the fixed rail width in the editor shell**

```css
.editor-shell.annotations-open {
  grid-template-columns: minmax(0, 1fr) 280px;
}

@media (max-width: 900px) {
  .editor-shell.annotations-open {
    grid-template-columns: minmax(0, 1fr) 248px;
  }
}
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "auto-collapses the left sidebar" && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js`

Expected: PASS with the rail width stable on desktop and the left sidebar collapsing only when needed.

- [ ] **Step 6: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add src/renderer/components/editorWithTabs/editor.vue src/renderer/components/flowrite/MarginCommentLayer.vue src/renderer/store/layout.js src/renderer/components/flowrite/Toolbar.vue test/unit/specs/layout-store.spec.js test/e2e/flowrite-margin-comments.spec.js
git commit -m "feat: adapt flowrite margin rail width to writing space"
```

## Task 9: Final Regression, Detached-Thread Check, And Ship-Blocker Verification

**Files:**
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-anchors.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-controller.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-storage.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-renderer-store.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/layout-store.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js`

- [ ] **Step 1: Run the focused Flowrite unit suite**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run unit -- --grep "Flowrite|flowrite|layout store"`

Expected: PASS with the new margin-anchor, controller, store, and layout coverage.

- [ ] **Step 2: Run the margin-specific Electron e2e specs**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js`

Expected: PASS with multi-paragraph creation, dot visibility, anchored cards, reply flow, and detached-thread rendering all green.

- [ ] **Step 3: Run renderer and main packaging checks**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && npx -y yarn@1.22.22 run pack:renderer && npx -y yarn@1.22.22 run pack:main`

Expected: PASS for both build targets.

- [ ] **Step 4: Run whitespace/syntax safety checks**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && git diff --check`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext
git add test/unit/specs/flowrite-margin-anchors.spec.js test/unit/specs/flowrite-controller.spec.js test/unit/specs/flowrite-storage.spec.js test/unit/specs/flowrite-renderer-store.spec.js test/unit/specs/flowrite-margin-layout.spec.js test/unit/specs/layout-store.spec.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js
git commit -m "test: verify flowrite margin comment rail"
```

## Self-Review

### Spec coverage

- Always-visible dots: covered by Task 4.
- Interaction-only underlines: covered by Task 4.
- Multi-paragraph anchors: covered by Task 1.
- Overlapping threads: covered by Task 7.
- `Ask Flowrite` creation in Muya selection UI only: covered by Task 3.
- True anchor-positioned cards instead of a generic list: covered by Task 5.
- Crowding/auto-collapse implementation: covered by Task 7.
- Reply + thread delete only: covered by Tasks 2 and 6.
- UI-only delete that does not touch AI context: covered by Task 2.
- Current data model retained: enforced by Tasks 1 and 2.
- Desktop/laptop width behavior and fixed rail width: covered by Task 8.
- Explicit exclusions (compose/suggestions/popover/manual reattach/message delete): intentionally absent from all tasks.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Each code-changing task includes concrete file paths, code snippets, commands, and expected outcomes.

### Type consistency

- The plan consistently uses `thread.comments` (not `messages`) to match the existing comments store.
- The plan keeps the existing `anchor.start` / `anchor.end` shape and extends `resolution` with `ranges`, `startParagraphId`, and `endParagraphId`.
- Renderer state names are consistent across tasks: `composerMarginThread`, `activeMarginThreadId`, `highlightedMarginThreadIds`.

Plan complete and saved to `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/docs/superpowers/plans/2026-04-10-flowrite-margin-comment-ui-plan.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

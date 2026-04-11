# Flowrite Margin Comment UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current separate margin rail behavior with an integrated document-attached comment surface: one shared scroll, Notion-like floating cards, exact anchor highlighting, always-visible dots, stable insertion-style card reflow, and a calmer thread/reply model.

**Architecture:** Keep the current Flowrite persistence model and existing anchor storage shape, but change the renderer architecture from `editor + aside rail` to `editor + integrated margin overlays in one scroll surface`. Reuse the current anchor resolver, thread store, and crowding helper where possible, but upgrade them to support exact attached-range rendering, non-empty sentence selections, and stable insertion reflow instead of simple push-down stacking.

**Tech Stack:** Electron, Vue 2 SFCs, Vuex, Muya editor plugins, Flowrite IPC/controller layer, Mocha + Chai unit tests, Playwright Electron e2e tests.

---

## File Map

### Existing files to modify

- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
  - Stop hiding `Ask Flowrite` for sentence/multi-paragraph selections and keep the selection metadata usable for exact anchors.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
  - Remove the separate `aside` margin behavior and mount the comment surface into the shared editor scroll context.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
  - Convert from separate rail shell to integrated positioned-card surface and focus/reflow orchestrator.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue`
  - Replace the current panel-like card UI with the approved floating card + thread spine + click-to-reply behavior.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadComposer.vue`
  - Keep immediate input for new threads, but align the visual treatment with the final card design and keep replies collapsed elsewhere.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue`
  - Restyle dots, remove glow, and position them against the integrated document surface.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginAnchorHighlights.vue`
  - Render exact attached highlights for sentences/paragraphs/ranges, with paragraph fallback reserved for detached recovery.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/marginLayout.js`
  - Replace push-down-only layout with stable insertion-style reflow and soft local motion metadata.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
  - Track thread focus/reply activation cleanly for click-to-reply and anchored-text focus without viewport jump.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
  - Replace old rail assumptions with integrated margin behavior and sentence-selection coverage.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js`
  - Preserve detached behavior under the integrated layout.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js`
  - Validate stable insertion reflow and crowding/compression.
- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-composer.spec.js`
  - Keep composer submit isolation and add behavior coverage for immediate new-thread input mode.

### New files to create

- `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-thread-card.spec.js`
  - Cover click-to-reply, visible-thread spine structure, and collapsed reply state for existing threads.

## Product Decisions Locked In

- `Ask Flowrite` must appear for any non-empty text selection.
- Margin comments live in one shared document scroll surface, not a separate pane/rail.
- Cards stay visible by default and compress only when crowded.
- New thread creation opens directly in input mode.
- Existing thread replies stay hidden until the card is clicked.
- Dots are always visible and use a quiet amber style with no glow.
- Underline/highlight appears only on interaction.
- Attached highlights must be exact; paragraph-level fallback is for detached recovery only.
- Card natural position is centered on the start of the anchored selection.
- Overlap resolution uses stable insertion-style local reflow, not simple push-down-only stacking.
- Clicking anchored text focuses the thread without viewport jump.
- Thread delete remains UI-only.

## Task 1: Make `Ask Flowrite` Available For Any Non-Empty Selection

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Write the failing e2e assertion for sentence selection**

```js
await selectTextInEditor(page, 'reflective paragraph with a soft cadence')
await expect(page.getByRole('button', { name: 'Ask Flowrite' })).toBeVisible()
```

- [ ] **Step 2: Run the focused e2e test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js --grep "sentence selection"`

Expected: FAIL because `flowriteSelectionMenu` still hides itself when `changes.start.key !== changes.end.key`.

- [ ] **Step 3: Implement selection-menu support for any non-empty selection**

```js
if (isCollapsed || !range || range.collapsed || !quote) {
  this.currentSelection = null
  this.hide()
  return
}

this.currentSelection = {
  quote,
  rect: {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  },
  start: {
    key: changes.start.key,
    offset: changes.start.offset,
    blockText: changes.start.block && typeof changes.start.block.text === 'string'
      ? changes.start.block.text
      : ''
  },
  end: {
    key: changes.end.key,
    offset: changes.end.offset,
    blockText: changes.end.block && typeof changes.end.block.text === 'string'
      ? changes.end.block.text
      : ''
  }
}
```

- [ ] **Step 4: Re-run the focused e2e test and verify it passes**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js --grep "sentence selection"`

Expected: PASS with `Ask Flowrite` visible for a sentence-length selection.

- [ ] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/muya/lib/ui/flowriteSelectionMenu/index.js flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js
git commit -m "fix: show ask flowrite for any selection"
```

## Task 2: Replace The Separate Rail With An Integrated Margin Surface

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/store/modules/flowrite.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Write the failing e2e assertion that there is no separate comment scroll shell**

```js
const annotationsAside = await page.locator('.flowrite-annotations').count()
expect(annotationsAside).toBe(0)
await expect(page.locator('.editor-main__margin-overlays')).toBeVisible()
```

- [ ] **Step 2: Run the focused e2e test and verify it fails**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js --grep "integrated margin"`

Expected: FAIL because `MarginCommentLayer.vue` still renders an `<aside class="flowrite-annotations">` with its own scroll wrapper.

- [ ] **Step 3: Mount the comment surface into the editor scroll context**

```vue
<div class="editor-main">
  <div ref="editor" class="editor-component"></div>
  <div v-if="!sourceCode" class="editor-main__margin-overlays">
    <margin-anchor-highlights ... />
    <margin-comment-dots ... />
    <margin-comment-layer
      v-if="showAnnotationsPane"
      ref="marginCommentLayer"
      :editor-root="$el"
      :paragraph-index="marginParagraphIndex"
    />
  </div>
</div>
```

```vue
<div class="flowrite-margin-surface" data-testid="flowrite-margin-comments">
  <margin-thread-composer ... />
  <div ref="threadSurface" class="flowrite-margin-surface__threads">
    <margin-thread-card
      v-for="thread in positionedThreads"
      :key="thread.id"
      ...
    />
  </div>
</div>
```

- [ ] **Step 4: Re-run the focused e2e test and verify it passes**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js --grep "integrated margin"`

Expected: PASS with comment cards mounted into the editor surface and no separate aside shell.

- [ ] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/renderer/components/editorWithTabs/editor.vue flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue flowrite-marktext/src/renderer/store/modules/flowrite.js flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js
git commit -m "feat: integrate flowrite comments into document margin"
```

## Task 3: Refine Card And Composer UI To Match The Approved Interaction Model

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginThreadComposer.vue`
- Create: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-thread-card.spec.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-composer.spec.js`

- [ ] **Step 1: Write the failing unit test for collapsed reply state on existing threads**

```js
it('keeps reply input hidden for an existing thread until the card is clicked', async function () {
  const wrapper = mount(MarginThreadCard, {
    propsData: {
      thread: {
        id: 'thread-1',
        comments: [{ id: 'c1', author: 'user', body: 'Keep this visible.' }]
      },
      active: false
    }
  })

  expect(wrapper.find('[data-testid="flowrite-margin-thread-reply-input"]').exists()).to.equal(false)
  await wrapper.trigger('click')
  expect(wrapper.emitted('focus-thread')).to.have.length(1)
})
```

- [ ] **Step 2: Write the failing unit test for the thread spine structure**

```js
it('renders a connected thread spine for multiple messages', function () {
  const wrapper = mount(MarginThreadCard, {
    propsData: {
      thread: {
        id: 'thread-2',
        comments: [
          { id: 'c1', author: 'user', body: 'First' },
          { id: 'c2', author: 'assistant', body: 'Second' }
        ]
      },
      active: false
    }
  })

  expect(wrapper.find('[data-testid="flowrite-margin-thread-spine"]').exists()).to.equal(true)
})
```

- [ ] **Step 3: Run the focused unit tests and verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn run unit -- --grep "collapsed reply state|thread spine"`

Expected: FAIL because the current card shows reply UI whenever `active` is true and has no spine structure.

- [ ] **Step 4: Implement the floating card + click-to-reply model**

```vue
<div class="flowrite-margin-thread-card__thread">
  <div class="flowrite-margin-thread-card__spine" data-testid="flowrite-margin-thread-spine"></div>
  <div
    v-for="comment in visibleComments"
    :key="comment.id"
    class="flowrite-margin-thread-card__message"
  >
    <div class="flowrite-margin-thread-card__avatar">{{ ... }}</div>
    <div class="flowrite-margin-thread-card__message-body">
      ...
    </div>
  </div>
</div>

<div v-if="showReplyInput" class="flowrite-margin-thread-card__reply">...</div>
```

```js
data () {
  return {
    replyDraft: '',
    isReplyPending: false,
    isExpanded: false,
    showReplyInput: false
  }
},
methods: {
  focusThread () {
    this.showReplyInput = true
    this.$emit('focus-thread', this.thread.id)
  }
}
```

- [ ] **Step 5: Keep new-thread composer immediate, but visually consistent**

```vue
<p class="flowrite-margin-composer__quote">"{{ anchor.quote }}"</p>
<textarea ... placeholder="Ask Flowrite about this passage"></textarea>
```

Keep the composer auto-focused for new threads, but align border radius, spacing, and metadata treatment with the final thread-card design.

- [ ] **Step 6: Re-run the focused unit tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn run unit -- --grep "collapsed reply state|thread spine|composer closes once user comment persists"`

Expected: PASS with thread cards calm by default and reply UI opening only after card interaction.

- [ ] **Step 7: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/renderer/components/flowrite/MarginThreadCard.vue flowrite-marktext/src/renderer/components/flowrite/MarginThreadComposer.vue flowrite-marktext/test/unit/specs/flowrite-margin-thread-card.spec.js flowrite-marktext/test/unit/specs/flowrite-margin-composer.spec.js
git commit -m "feat: refine flowrite margin thread cards"
```

## Task 4: Render Exact Highlights And Quiet Amber Dots

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginAnchorHighlights.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
- Test: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js`

- [ ] **Step 1: Write the failing e2e assertion for exact attached highlight width**

```js
const highlightBox = await page.locator('[data-testid="flowrite-margin-highlight"]').first().boundingBox()
expect(highlightBox.width).toBeLessThan(paragraphBox.width)
expect(highlightBox.width).toBeGreaterThan(40)
```

- [ ] **Step 2: Write the failing e2e assertion for flat quiet dots**

```js
const dotBoxShadow = await page.locator('[data-testid="flowrite-margin-dot"]').first().evaluate(node => {
  return window.getComputedStyle(node).boxShadow
})
expect(dotBoxShadow === 'none' || dotBoxShadow === '').toBeTruthy()
```

- [ ] **Step 3: Run the focused e2e tests and verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js --grep "exact highlight|quiet dots"`

Expected: FAIL because attached highlights still fall back too loosely in some paths and dots still carry the older stronger visual treatment.

- [ ] **Step 4: Prefer exact attached ranges and reserve paragraph fallback for detached recovery**

```js
const fallbackRects = resolution.status === ANCHOR_DETACHED
  ? (paragraph && paragraph.element ? [paragraph.element.getBoundingClientRect()] : [])
  : []
```

```js
segments.push({
  key: `${thread.id}:${rangeEntry.paragraphId}:${index}:${rectIndex}`,
  detached: resolution.status === ANCHOR_DETACHED,
  style: {
    left: `${Math.max(0, rect.left - editorRect.left)}px`,
    top: `${Math.max(0, rect.bottom - editorRect.top - HIGHLIGHT_HEIGHT)}px`,
    width: `${Math.max(0, rect.width)}px`,
    height: `${HIGHLIGHT_HEIGHT}px`
  }
})
```

- [ ] **Step 5: Apply the approved indicator styling**

```css
.flowrite-margin-dot__core {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(210, 153, 51, 0.82);
  box-shadow: none;
}

.flowrite-margin-highlight {
  background: linear-gradient(to top, rgba(210, 153, 51, 0.18) 0, rgba(210, 153, 51, 0.18) 42%, transparent 42%);
}
```

- [ ] **Step 6: Re-run the focused e2e tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js --grep "exact highlight|quiet dots"`

Expected: PASS with exact attached highlights and non-glowing amber dots.

- [ ] **Step 7: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/renderer/components/flowrite/MarginAnchorHighlights.vue flowrite-marktext/src/renderer/components/flowrite/MarginCommentDots.vue flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js
git commit -m "fix: refine flowrite anchor indicators"
```

## Task 5: Replace Push-Down Stacking With Stable Insertion Reflow

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/marginLayout.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`

- [ ] **Step 1: Write the failing unit test for stable insertion order-preserving reflow**

```js
it('keeps nearby cards close to their anchors instead of only pushing later cards downward', function () {
  const layout = buildMarginLayout([
    { id: 'a', naturalTop: 100, height: 120 },
    { id: 'b', naturalTop: 140, height: 120, active: true },
    { id: 'c', naturalTop: 180, height: 120 }
  ], { gap: 12 })

  expect(layout.map(item => item.id)).to.deep.equal(['a', 'b', 'c'])
  expect(layout.find(item => item.id === 'b').top).to.be.closeTo(140, 30)
  expect(layout.find(item => item.id === 'c').top - layout.find(item => item.id === 'c').naturalTop).to.be.lessThan(120)
})
```

- [ ] **Step 2: Write the failing e2e assertion that focusing text does not jump the viewport**

```js
const scrollBefore = await page.evaluate(() => document.querySelector('.editor-component').scrollTop)
await page.locator('[data-testid="flowrite-margin-highlight"]').first().click({ force: true })
const scrollAfter = await page.evaluate(() => document.querySelector('.editor-component').scrollTop)
expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(4)
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn run unit -- --grep "stable insertion" && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js --grep "does not jump the viewport"`

Expected: FAIL because `buildMarginLayout` still uses strict push-down and the current layer logic favors scroll-to-thread behavior.

- [ ] **Step 4: Implement stable insertion reflow in the pure helper**

```js
export const buildMarginLayout = (threads, options = {}) => {
  const sorted = normalizeThreads(threads)
  return relaxIntoStableSlots(sorted, {
    gap,
    compressionDriftThreshold,
    compressionMessageCountThreshold
  })
}
```

```js
const relaxIntoStableSlots = (threads, options) => {
  // Keep document order fixed, minimize absolute drift from naturalTop,
  // and only move neighbors enough to clear overlap.
}
```

- [ ] **Step 5: Use local reflow without viewport jump in the layer**

```js
activateThread (threadId) {
  this.$store.commit('SET_FLOWRITE_MARGIN_THREAD_FOCUS', threadId)
  this.scheduleRefresh()
}
```

Do not call any scroll-into-view behavior from thread activation. Let the layer recompute local positions and animate them softly.

- [ ] **Step 6: Re-run the focused tests and verify they pass**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn run unit -- --grep "stable insertion" && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js --grep "does not jump the viewport"`

Expected: PASS with local, ordered reflow and stable viewport behavior.

- [ ] **Step 7: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/src/renderer/components/flowrite/marginLayout.js flowrite-marktext/src/renderer/components/flowrite/MarginCommentLayer.vue flowrite-marktext/test/unit/specs/flowrite-margin-layout.spec.js flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js
git commit -m "feat: stabilize flowrite margin card reflow"
```

## Task 6: Final Integrated Margin QA And Regression Coverage

**Files:**
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js`
- Modify: `/Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext/test/unit/specs/flowrite-renderer-store.spec.js`

- [ ] **Step 1: Add final e2e assertions for the approved behavior**

```js
await expect(page.locator('[data-testid="flowrite-margin-thread"]')).toBeVisible()
await expect(page.locator('[data-testid="flowrite-margin-thread-reply-input"]')).toHaveCount(0)

await page.locator('[data-testid="flowrite-margin-thread"]').first().click()
await expect(page.locator('[data-testid="flowrite-margin-thread-reply-input"]')).toHaveCount(1)
```

```js
await expect(page.locator('[data-testid="flowrite-margin-dot"]')).toHaveCount(2)
await expect(page.locator('[data-testid="flowrite-margin-highlight"]')).toHaveCount(0)
```

- [ ] **Step 2: Run the focused margin suites**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn run unit -- --grep "Flowrite margin|Flowrite renderer store" && yarn playwright test -c test/e2e/playwright.config.js test/e2e/flowrite-margin-comments.spec.js test/e2e/flowrite-margin-detached.spec.js`

Expected: PASS with the final integrated-margin interaction model.

- [ ] **Step 3: Run packaging checks**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite/flowrite-marktext && yarn run pack:renderer && yarn run pack:main`

Expected: both commands finish successfully.

- [ ] **Step 4: Run diff hygiene**

Run: `cd /Users/fuyuming/Desktop/project/Flowrite && git diff --check`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/fuyuming/Desktop/project/Flowrite
git add flowrite-marktext/test/e2e/flowrite-margin-comments.spec.js flowrite-marktext/test/e2e/flowrite-margin-detached.spec.js flowrite-marktext/test/unit/specs/flowrite-renderer-store.spec.js
git commit -m "test: verify integrated flowrite margin comments"
```

## Self-Review

- Spec coverage:
  - integrated margin surface: Task 2
  - any non-empty selection for `Ask Flowrite`: Task 1
  - Notion-like thread/card UI and click-to-reply: Task 3
  - quiet amber dots and exact highlights: Task 4
  - stable insertion reflow and no viewport jump: Task 5
  - final regression coverage: Task 6
- Placeholder scan:
  - no `TBD`, `TODO`, or deferred implementation placeholders inside in-scope tasks
- Type consistency:
  - reuses existing `thread.comments`, `thread.collapsed`, `SET_FLOWRITE_MARGIN_THREAD_FOCUS`, and current component file boundaries


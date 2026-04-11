const os = require('os')
const path = require('path')
const fs = require('fs/promises')
const { expect, test } = require('@playwright/test')
const { closeElectron, launchElectron } = require('./helpers')

const waitForRendererIdle = async page => {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(750)
}

const selectTextInEditor = async (page, targetText) => {
  await page.evaluate(text => {
    const paragraphs = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
    const paragraph = paragraphs.find(node => node.textContent.includes(text))
    if (!paragraph) {
      throw new Error(`Unable to find paragraph containing "${text}".`)
    }

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    let startNode = null
    let endNode = null
    let startOffset = 0
    let endOffset = 0
    let consumed = 0
    let node
    const startIndex = paragraph.textContent.indexOf(text)
    const endIndex = startIndex + text.length

    while ((node = walker.nextNode())) {
      const nextConsumed = consumed + node.textContent.length
      if (!startNode && startIndex >= consumed && startIndex <= nextConsumed) {
        startNode = node
        startOffset = startIndex - consumed
      }
      if (!endNode && endIndex >= consumed && endIndex <= nextConsumed) {
        endNode = node
        endOffset = endIndex - consumed
      }
      consumed = nextConsumed
    }

    if (!startNode || !endNode) {
      throw new Error(`Unable to build DOM range for "${text}".`)
    }

    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)

    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const editorContainer = document.querySelector('.editor-wrapper .editor-component > div')
    editorContainer.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Shift',
      bubbles: true
    }))
  }, targetText)
}

const selectTextRangeInEditor = async (page, startText, endText) => {
  await page.evaluate(({ startText, endText }) => {
    const paragraphs = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
    const startParagraph = paragraphs.find(node => node.textContent.includes(startText))
    const endParagraph = paragraphs.find(node => node.textContent.includes(endText))

    if (!startParagraph || !endParagraph) {
      throw new Error(`Unable to find paragraphs for "${startText}" -> "${endText}".`)
    }

    const findTextPosition = (paragraph, text, useTextEnd = false) => {
      const fullText = paragraph.textContent || ''
      const startIndex = fullText.indexOf(text)
      if (startIndex === -1) {
        throw new Error(`Unable to find "${text}" in paragraph.`)
      }
      const targetIndex = useTextEnd ? startIndex + text.length : startIndex
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      let consumed = 0
      let node
      while ((node = walker.nextNode())) {
        const nextConsumed = consumed + node.textContent.length
        if (targetIndex >= consumed && targetIndex <= nextConsumed) {
          return {
            node,
            offset: targetIndex - consumed
          }
        }
        consumed = nextConsumed
      }
      throw new Error(`Unable to map DOM range for "${text}".`)
    }

    const start = findTextPosition(startParagraph, startText, false)
    const end = findTextPosition(endParagraph, endText, true)
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)

    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const editorContainer = document.querySelector('.editor-wrapper .editor-component > div')
    editorContainer.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Shift',
      bubbles: true
    }))
  }, { startText, endText })
}

const setComposerDraft = async (page, body) => {
  const input = page.locator('[data-testid="flowrite-margin-thread-input"]').last()
  await input.waitFor({ state: 'visible' })
  await input.fill(body)
}

const getNativeMarginHighlightGeometry = async page => {
  return page.evaluate(() => {
    const highlightName = 'flowrite-margin-anchor-active'
    const registry = typeof CSS !== 'undefined' ? CSS.highlights : null
    const highlight = registry && typeof registry.get === 'function'
      ? registry.get(highlightName)
      : null

    if (!highlight) {
      return null
    }

    const ranges = Array.from(highlight)
    const rects = ranges.flatMap(range => Array.from(range.getClientRects()))
      .filter(rect => rect && rect.width > 0 && rect.height > 0)

    return {
      rangeCount: ranges.length,
      rectCount: rects.length,
      maxWidth: rects.reduce((width, rect) => Math.max(width, rect.width), 0)
    }
  })
}

const nativeMarginHighlightCount = async page => {
  return page.evaluate(() => {
    const highlightName = 'flowrite-margin-anchor-active'
    const registry = typeof CSS !== 'undefined' ? CSS.highlights : null
    const highlight = registry && typeof registry.get === 'function'
      ? registry.get(highlightName)
      : null

    return highlight ? Array.from(highlight).length : 0
  })
}

test.describe('Flowrite margin comments', () => {
  test('shows Ask Flowrite for sentence selection', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-selection-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n\nA later paragraph that lands with a sharper note.\n', 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], { userDataDir })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence'))
      })

      await selectTextInEditor(page, 'reflective paragraph with a soft cadence')
      await expect(page.getByRole('button', { name: 'Ask Flowrite' })).toBeVisible()
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('renders Ask Flowrite inside a two-row integrated selection toolbar', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-selection-toolbar-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n', 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], { userDataDir })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence'))
      })

      await selectTextInEditor(page, 'reflective paragraph')

      const toolbar = page.locator('[data-testid="flowrite-selection-toolbar"]')
      await expect(toolbar).toBeVisible()
      await expect(page.locator('[data-testid="flowrite-selection-toolbar-row"]')).toHaveCount(2)
      await expect(page.locator('[data-testid="flowrite-selection-tool-quote"]')).toBeVisible()
      await expect(page.locator('[data-testid="flowrite-selection-tool-code"]')).toBeVisible()
      await expect(page.locator('[data-testid="flowrite-selection-comment-button"]')).toBeVisible()

      const iconMarkup = await page.evaluate(() => {
        const quoteButton = document.querySelector('[data-testid="flowrite-selection-tool-quote"]')
        const codeButton = document.querySelector('[data-testid="flowrite-selection-tool-code"]')
        return {
          quote: quoteButton ? quoteButton.innerHTML : '',
          code: codeButton ? codeButton.innerHTML : ''
        }
      })

      expect(iconMarkup.quote).toContain('ag-format-picker__icon-wrapper')
      expect(iconMarkup.quote).toContain('ag-format-picker__icon-inner')
      expect(iconMarkup.code).toContain('ag-format-picker__icon-wrapper')
      expect(iconMarkup.code).toContain('ag-format-picker__icon-inner')

      const geometry = await page.evaluate(() => {
        const askButton = document.querySelector('[data-testid="flowrite-selection-comment-button"]')
        const quoteButton = document.querySelector('[data-testid="flowrite-selection-tool-quote"]')
        const toolbarSurface = document.querySelector('[data-testid="flowrite-selection-toolbar"]')

        if (!askButton || !quoteButton || !toolbarSurface) {
          return null
        }

        const askRect = askButton.getBoundingClientRect()
        const quoteRect = quoteButton.getBoundingClientRect()
        const toolbarRect = toolbarSurface.getBoundingClientRect()

        return {
          askWidth: askRect.width,
          quoteWidth: quoteRect.width,
          toolbarHeight: toolbarRect.height
        }
      })

      expect(geometry).not.toBeNull()
      expect(geometry.askWidth).toBeGreaterThan(geometry.quoteWidth * 1.5)
      expect(geometry.toolbarHeight).toBeGreaterThan(70)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('shows Ask Flowrite for multi-paragraph selection', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-multiparagraph-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n\nA later paragraph that lands with a sharper note.\n', 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], { userDataDir })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        const paragraphs = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
        return paragraphs.some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence')) &&
          paragraphs.some(node => (node.textContent || '').includes('sharper note'))
      })

      await selectTextRangeInEditor(page, 'reflective paragraph', 'sharper note')
      await expect(page.getByRole('button', { name: 'Ask Flowrite' })).toBeVisible()
      await expect(page.locator('[data-testid="flowrite-selection-toolbar-row"]')).toHaveCount(1)
      await expect(page.locator('[data-testid="flowrite-selection-tool-quote"]')).toHaveCount(0)
      await expect(page.locator('[data-testid="flowrite-selection-tool-code"]')).toHaveCount(0)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('renders comments in an integrated margin', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-integrated-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n\nA later paragraph that lands with a sharper note.\n', 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], { userDataDir })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence'))
      })

      await selectTextInEditor(page, 'reflective paragraph')
      await page.getByRole('button', { name: 'Ask Flowrite' }).click()

      const annotationsAside = await page.locator('.flowrite-annotations').count()
      expect(annotationsAside).toBe(0)
      await expect(page.locator('.editor-main__margin-overlays [data-testid="flowrite-margin-comments"]')).toBeVisible()
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('keeps the document scrollable when the integrated margin opens', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-scroll-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const filler = Array.from(
      { length: 18 },
      (_, index) => `A setup paragraph ${index + 1} that keeps the editor tall enough to require scrolling.`
    ).join('\n\n')

    await fs.writeFile(articlePath, `# Draft\n\n${filler}\n\nA reflective paragraph with a soft cadence.\n`, 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], { userDataDir })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('A setup paragraph 18'))
      })

      await selectTextInEditor(page, 'reflective paragraph')
      await page.getByRole('button', { name: 'Ask Flowrite' }).click()
      await expect(page.locator('[data-testid="flowrite-margin-thread-composer"]')).toBeVisible()

      const scrollMetrics = await page.evaluate(() => {
        const editor = document.querySelector('.editor-component')
        if (!editor) {
          return null
        }

        editor.scrollTop = 240

        return {
          clientHeight: editor.clientHeight,
          scrollHeight: editor.scrollHeight,
          scrollTop: editor.scrollTop
        }
      })

      expect(scrollMetrics).not.toBeNull()
      expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight + 200)
      expect(scrollMetrics.scrollTop).toBeGreaterThan(0)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('renders an exact highlight for an attached sentence selection', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-highlight-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence and a closing phrase for contrast.\n\nA later paragraph that lands with a sharper note.\n', 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], { userDataDir })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence'))
      })

      await selectTextInEditor(page, 'soft cadence')
      await page.getByRole('button', { name: 'Ask Flowrite' }).click()
      await expect(page.locator('[data-testid="flowrite-margin-thread-composer"]')).toBeVisible()
      await page.waitForFunction(() => {
        const highlight = CSS.highlights && CSS.highlights.get('flowrite-margin-anchor-active')
        return Boolean(highlight && Array.from(highlight).length > 0)
      })

      const paragraphWidth = await page.evaluate(() => {
        const paragraph = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .find(node => (node.textContent || '').includes('soft cadence and a closing phrase'))
        const paragraphRect = paragraph ? paragraph.getBoundingClientRect() : null
        return paragraphRect ? paragraphRect.width : null
      })
      const geometry = await getNativeMarginHighlightGeometry(page)

      expect(geometry).not.toBeNull()
      expect(paragraphWidth).not.toBeNull()
      expect(geometry.rangeCount).toBeGreaterThan(0)
      expect(geometry.rectCount).toBeGreaterThan(0)
      expect(geometry.maxWidth).toBeLessThan(paragraphWidth)
      expect(geometry.maxWidth).toBeGreaterThan(40)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('focuses a highlighted passage without jumping the viewport', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-focus-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')
    const filler = Array.from({ length: 18 }, (_, index) => `A setup paragraph ${index + 1} that keeps the editor tall enough to scroll.`).join('\n\n')

    await fs.writeFile(articlePath, `# Draft\n\n${filler}\n\nA reflective paragraph with a soft cadence.\n\nA later paragraph that lands with a sharper note.\n`, 'utf8')
    await fs.writeFile(clientModulePath, `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create () {
                return {
                  id: 'msg_margin_text_only',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{
                    type: 'text',
                    text: 'No margin reply.'
                  }]
                }
              }
            }
          },
          model: 'flowrite-test-model'
        }
      }
    `, 'utf8')

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], {
        userDataDir,
        env: {
          AI_GATEWAY_API_KEY: 'flowrite-test-key',
          FLOWRITE_TEST_CLIENT_MODULE: clientModulePath
        }
      })
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence'))
      })

      await page.evaluate(() => {
        const editor = document.querySelector('.editor-component')
        if (editor) {
          editor.scrollTop = editor.scrollHeight
        }
      })
      await page.waitForTimeout(200)

      await selectTextInEditor(page, 'reflective paragraph')
      await page.getByRole('button', { name: 'Ask Flowrite' }).click()
      await expect(page.locator('[data-testid="flowrite-margin-thread-composer"]')).toBeVisible()

      await setComposerDraft(page, 'Keep track of this thought.')
      await page.locator('[data-testid="flowrite-margin-thread-submit"]').last().click({ force: true })

      await page.waitForFunction(() => {
        const editorRoot = document.querySelector('.editor-wrapper')
        const store = editorRoot && editorRoot.__vue__ && editorRoot.__vue__.$store
        const comments = store && store.state && store.state.flowrite
          ? store.state.flowrite.comments
          : []
        return Array.isArray(comments) && comments.some(thread => {
          return thread &&
            thread.scope === 'margin' &&
            thread.anchor &&
            thread.anchor.quote === 'reflective paragraph' &&
            Array.isArray(thread.comments) &&
            thread.comments.some(comment => comment && comment.author === 'user' && comment.body === 'Keep track of this thought.')
        })
      })

      const threadId = await page.evaluate(() => {
        const editorRoot = document.querySelector('.editor-wrapper')
        const store = editorRoot && editorRoot.__vue__ && editorRoot.__vue__.$store
        const thread = store && store.state && store.state.flowrite && Array.isArray(store.state.flowrite.comments)
          ? store.state.flowrite.comments.find(candidate => candidate && candidate.scope === 'margin' && candidate.anchor && candidate.anchor.quote === 'reflective paragraph')
          : null

        return thread ? thread.id : null
      })

      expect(threadId).not.toBeNull()
      await page.locator('[data-testid="flowrite-margin-thread"]').first().click()
      await page.waitForFunction(() => {
        const highlight = CSS.highlights && CSS.highlights.get('flowrite-margin-anchor-active')
        return Boolean(highlight && Array.from(highlight).length > 0)
      })

      const scrollBefore = await page.evaluate(() => {
        const editor = document.querySelector('.editor-component')
        return editor ? editor.scrollTop : 0
      })

      await page.evaluate(() => {
        const highlight = CSS.highlights && CSS.highlights.get('flowrite-margin-anchor-active')
        const targetRange = highlight ? Array.from(highlight)[0] : null
        const rect = targetRange ? targetRange.getBoundingClientRect() : null
        if (!rect || !rect.width || !rect.height) {
          throw new Error('Unable to find a visible Flowrite native highlight range.')
        }

        const targetNode = document.elementFromPoint(rect.left + Math.min(rect.width / 2, 8), rect.top + Math.min(rect.height / 2, 4))
        if (!targetNode) {
          throw new Error('Unable to find a clickable DOM target for the highlighted passage.')
        }

        targetNode.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + Math.min(rect.width / 2, 8),
          clientY: rect.top + Math.min(rect.height / 2, 4)
        }))
      })
      await page.waitForTimeout(200)

      const result = await page.evaluate(() => {
        const editorRoot = document.querySelector('.editor-wrapper')
        const store = editorRoot && editorRoot.__vue__ && editorRoot.__vue__.$store
        const editor = document.querySelector('.editor-component')
        return {
          activeMarginThreadId: store && store.state && store.state.flowrite ? store.state.flowrite.activeMarginThreadId : null,
          scrollTop: editor ? editor.scrollTop : 0
        }
      })

      expect(result.activeMarginThreadId).toBe(threadId)
      expect(Math.abs(result.scrollTop - scrollBefore)).toBeLessThanOrEqual(4)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('opens the Ask Flowrite composer from a selection and posts a margin comment in the rail', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n\nA later paragraph that lands with a sharper note.\n', 'utf8')
    await fs.writeFile(clientModulePath, `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        let callCount = 0
        return {
          client: {
            messages: {
              create: async function create (payload) {
                callCount += 1
                if (callCount % 2 === 1) {
                  const threadId = payload.metadata && payload.metadata.threadId
                    ? payload.metadata.threadId
                    : 'thread-margin-fallback'
                  return {
                    id: 'msg_margin_tool_1',
                    role: 'assistant',
                    stop_reason: 'tool_use',
                    content: [{
                      type: 'tool_use',
                      id: 'toolu_margin_1',
                      name: 'create_comment',
                      input: {
                        threadId,
                        scope: 'margin',
                        body: 'AI reply: tighten the image so the cadence lands harder.'
                      }
                    }]
                  }
                }

                return {
                  id: 'msg_margin_tool_2',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{
                    type: 'text',
                    text: 'Reply posted.'
                  }]
                }
              }
            }
          },
          model: 'flowrite-test-model'
        }
      }
    `, 'utf8')

    const launchOptions = {
      userDataDir,
      env: {
        AI_GATEWAY_API_KEY: 'flowrite-test-key',
        FLOWRITE_TEST_CLIENT_MODULE: clientModulePath
      }
    }

    let app = null
    let page = null

    try {
      const launched = await launchElectron([articlePath], launchOptions)
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph'))
      })

      await selectTextInEditor(page, 'reflective paragraph')
      const askFlowriteButton = page.getByRole('button', { name: 'Ask Flowrite' })
      const marginRail = page.locator('[data-testid="flowrite-margin-comments"]')
      await page.setViewportSize({ width: 1360, height: 720 })

      await expect(askFlowriteButton).toBeVisible()

      await askFlowriteButton.click()
      await expect(marginRail).toBeVisible()
      const sideBar = page.locator('.side-bar')
      const composer = page.locator('[data-testid="flowrite-margin-thread-composer"]')
      await expect(composer).toBeVisible()

      const submitButton = page.locator('[data-testid="flowrite-margin-thread-submit"]').last()
      await setComposerDraft(page, 'Can you sharpen this passage?')
      await expect(submitButton).toBeEnabled()
      await submitButton.click({ force: true })

      await expect(marginRail).toBeVisible()
      await expect(page.locator('[data-testid="flowrite-margin-thread"]')).toHaveCount(1)
      await expect(page.locator('[data-testid="flowrite-margin-thread-reply-input"]')).toHaveCount(0)
      await expect(page.locator('[data-testid="flowrite-margin-dot"]')).toHaveCount(1)
      await expect.poll(() => nativeMarginHighlightCount(page)).toBe(0)

      await page.setViewportSize({ width: 1240, height: 720 })
      await expect(sideBar).toBeHidden()

      const firstThread = page.locator('[data-testid="flowrite-margin-thread"]').first()
      await expect(firstThread).toContainText('Can you sharpen this passage?')
      await expect(firstThread.locator('[data-testid="flowrite-margin-thread-status"]')).toContainText('Attached')
      await firstThread.click()
      await expect(page.locator('[data-testid="flowrite-margin-thread-reply-input"]')).toHaveCount(1)

      const geometry = await page.evaluate(() => {
        const paragraph = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .find(node => (node.textContent || '').includes('reflective paragraph'))
        const thread = document.querySelector('[data-testid="flowrite-margin-thread"]')

        if (!paragraph || !thread) {
          return null
        }

        const paragraphRect = paragraph.getBoundingClientRect()
        const threadRect = thread.getBoundingClientRect()
        return {
          verticalDelta: Math.abs(threadRect.top - paragraphRect.top),
          horizontalDelta: threadRect.left - paragraphRect.right
        }
      })

      expect(geometry).not.toBeNull()
      expect(geometry.verticalDelta).toBeLessThanOrEqual(28)
      expect(geometry.horizontalDelta).toBeGreaterThan(24)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

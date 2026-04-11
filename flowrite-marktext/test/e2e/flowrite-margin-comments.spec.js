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
        return Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .some(node => (node.textContent || '').includes('reflective paragraph with a soft cadence'))
      })

      await selectTextRangeInEditor(page, 'reflective paragraph', 'sharper note')
      await expect(page.getByRole('button', { name: 'Ask Flowrite' })).toBeVisible()
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
      await expect(page.locator('[data-testid="flowrite-margin-highlight"]')).toHaveCount(1)

      const geometry = await page.evaluate(() => {
        const paragraph = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
          .find(node => (node.textContent || '').includes('soft cadence and a closing phrase'))
        const highlight = document.querySelector('[data-testid="flowrite-margin-highlight"]')

        if (!paragraph || !highlight) {
          return null
        }

        const paragraphRect = paragraph.getBoundingClientRect()
        const highlightRect = highlight.getBoundingClientRect()
        return {
          paragraphWidth: paragraphRect.width,
          highlightWidth: highlightRect.width
        }
      })

      expect(geometry).not.toBeNull()
      expect(geometry.highlightWidth).toBeLessThan(geometry.paragraphWidth)
      expect(geometry.highlightWidth).toBeGreaterThan(40)
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

      await page.setViewportSize({ width: 1240, height: 720 })
      await expect(sideBar).toBeHidden()

      const firstThread = page.locator('[data-testid="flowrite-margin-thread"]').first()
      await expect(firstThread).toContainText('reflective paragraph')
      await expect(firstThread).toContainText('Can you sharpen this passage?')
      await expect(firstThread.locator('[data-testid="flowrite-margin-thread-status"]')).toContainText('Attached')

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

      expect(geometry).to.not.equal(null)
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

const os = require('os')
const path = require('path')
const fs = require('fs/promises')
const { expect, test } = require('@playwright/test')
const { closeElectron, launchElectron } = require('./helpers')

const LOCKED_HIGHLIGHT_NAME = 'flowrite-margin-anchor-locked'
const waitForRendererIdle = async page => {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(750)
}

const getCurrentMarkdown = async page => {
  return page.evaluate(() => {
    const editorRoot = document.querySelector('.editor-wrapper')
    const editorVm = editorRoot && editorRoot.__vue__
    return editorVm && editorVm.currentFile ? editorVm.currentFile.markdown || '' : ''
  })
}

const setCaretInParagraph = async (page, targetText, offset = 0) => {
  await page.evaluate(({ targetText, offset }) => {
    const paragraphs = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
    const paragraph = paragraphs.find(node => (node.textContent || '').includes(targetText))
    if (!paragraph) {
      throw new Error(`Unable to find paragraph containing "${targetText}".`)
    }

    const textNodes = []
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    let textNode = null
    while ((textNode = walker.nextNode())) {
      textNodes.push(textNode)
    }

    if (!textNodes.length) {
      throw new Error(`Unable to place a caret inside "${targetText}".`)
    }

    const safeOffset = Math.max(0, Math.min(offset, paragraph.textContent.length))
    let consumed = 0
    let targetNode = textNodes[textNodes.length - 1]
    let targetOffset = targetNode.textContent.length

    for (const candidate of textNodes) {
      const nextConsumed = consumed + candidate.textContent.length
      if (safeOffset <= nextConsumed) {
        targetNode = candidate
        targetOffset = safeOffset - consumed
        break
      }
      consumed = nextConsumed
    }

    const range = document.createRange()
    range.setStart(targetNode, targetOffset)
    range.collapse(true)

    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const editorSurface = document.querySelector('.editor-wrapper .editor-component > div')
    if (editorSurface && typeof editorSurface.focus === 'function') {
      editorSurface.focus()
    }
    editorSurface.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true
    }))
  }, {
    targetText,
    offset
  })
}

const dispatchPaste = async (page, text) => {
  return page.evaluate(pasteText => {
    const editorSurface = document.querySelector('.editor-wrapper .editor-component > div')
    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true
    })

    Object.defineProperty(pasteEvent, 'clipboardData', {
      configurable: true,
      enumerable: true,
      value: {
        items: [],
        files: [],
        types: ['text/plain'],
        getData (type) {
          return type === 'text/plain' ? pasteText : ''
        }
      }
    })

    editorSurface.dispatchEvent(pasteEvent)
    return pasteEvent.defaultPrevented
  }, text)
}

const waitForLockedHighlightCount = async (page, expectedCount) => {
  await page.waitForFunction(({ highlightName, expectedCount }) => {
    const registry = typeof CSS !== 'undefined' ? CSS.highlights : null
    const highlight = registry && typeof registry.get === 'function'
      ? registry.get(highlightName)
      : null
    const count = highlight ? Array.from(highlight).length : 0
    return count === expectedCount
  }, {
    highlightName: LOCKED_HIGHLIGHT_NAME,
    expectedCount
  })
}

test.describe('Flowrite AI review locking', () => {
  test('blocks edits inside in-flight review anchors and releases them after completion', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-ai-review-locking-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-ai-review-locking-client.js')
    const anchorFilePath = path.join(tempRoot, 'flowrite-ai-review-locking-anchor.json')
    const lockedParagraphText = 'A second paragraph lands without enough concrete pressure.'

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with too many unresolved turns.\n\nA second paragraph lands without enough concrete pressure.\n', 'utf8')
    await fs.writeFile(clientModulePath, `
      const fs = require('fs')

      module.exports.createAnthropicClient = function createAnthropicClient () {
        let callCount = 0
        return {
          client: {
            messages: {
              create: async function create () {
                callCount += 1
                if (callCount === 1) {
                  const marginAnchor = JSON.parse(fs.readFileSync(${JSON.stringify(anchorFilePath)}, 'utf8'))
                  return {
                    id: 'msg_review_tool_lock_1',
                    role: 'assistant',
                    stop_reason: 'tool_use',
                    content: [{
                      type: 'tool_use',
                      id: 'toolu_review_lock_1',
                      name: 'create_comment',
                      input: {
                        scope: 'margin',
                        anchor: marginAnchor,
                        body: 'Margin review: this paragraph needs firmer, more concrete pressure.'
                      }
                    }]
                  }
                }

                await new Promise(resolve => setTimeout(resolve, 1800))

                return {
                  id: 'msg_review_lock_done',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{
                    type: 'text',
                    text: 'Review complete.'
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
      const reviewParagraph = await page.evaluate(targetText => {
        const paragraphs = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
        const paragraph = paragraphs.find(node => (node.textContent || '').includes(targetText))
        if (!paragraph) {
          return null
        }

        const text = paragraph.textContent || ''
        return {
          version: 1,
          start: {
            key: paragraph.id,
            offset: 0
          },
          end: {
            key: paragraph.id,
            offset: text.length
          },
          quote: text,
          contextBefore: '',
          contextAfter: ''
        }
      }, lockedParagraphText)
      expect(reviewParagraph).not.toBeNull()
      await fs.writeFile(anchorFilePath, JSON.stringify(reviewParagraph), 'utf8')

      await expect(page.locator('[data-testid="flowrite-toolbar"]')).toBeVisible()
      await page.locator('[data-testid="flowrite-have-a-look-button"]').click()
      await expect(page.locator('[data-testid="flowrite-have-a-look-popover"]')).toBeVisible()
      await page.locator('[data-testid="flowrite-have-a-look-go"]').click()

      await expect(page.locator('[data-testid="flowrite-have-a-look-button"]')).toContainText('Reviewing...')
      await waitForLockedHighlightCount(page, 1)

      await setCaretInParagraph(page, lockedParagraphText, 0)
      const markdownBeforeLockedType = await getCurrentMarkdown(page)
      await page.keyboard.type('LOCK ')
      await page.waitForTimeout(250)
      const markdownAfterLockedType = await getCurrentMarkdown(page)

      expect(markdownAfterLockedType).toBe(markdownBeforeLockedType)

      await setCaretInParagraph(page, lockedParagraphText, 0)
      const markdownBeforeLockedPaste = await getCurrentMarkdown(page)
      const pasteWasPrevented = await dispatchPaste(page, 'PASTED ')
      await page.waitForTimeout(250)
      const markdownAfterLockedPaste = await getCurrentMarkdown(page)

      expect(pasteWasPrevented).toBe(true)
      expect(markdownAfterLockedPaste).toBe(markdownBeforeLockedPaste)

      await waitForLockedHighlightCount(page, 0)
      await expect(page.locator('[data-testid="flowrite-have-a-look-button"]')).toContainText('Have a look!')

      await setCaretInParagraph(page, lockedParagraphText, 0)
      const markdownBeforeUnlockedPaste = await getCurrentMarkdown(page)
      await dispatchPaste(page, 'FREE ')
      await page.waitForTimeout(350)
      const markdownAfterUnlockedPaste = await getCurrentMarkdown(page)

      expect(markdownAfterUnlockedPaste).not.toBe(markdownBeforeUnlockedPaste)
      expect(markdownAfterUnlockedPaste).toContain(`${lockedParagraphText}FREE `)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

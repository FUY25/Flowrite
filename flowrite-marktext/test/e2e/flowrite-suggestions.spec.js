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

const buildClientModule = () => `
  module.exports.createAnthropicClient = function createAnthropicClient () {
    let callCount = 0
    return {
      client: {
        messages: {
          create: async function create (payload) {
            callCount += 1
            if (callCount === 1) {
              const threadId = payload.metadata && payload.metadata.threadId
                ? payload.metadata.threadId
                : 'thread-suggestion'
              return {
                id: 'msg_suggestion_tool_1',
                role: 'assistant',
                stop_reason: 'tool_use',
                content: [{
                  type: 'tool_use',
                  id: 'toolu_suggestion_1',
                  name: 'propose_suggestion',
                  input: {
                    threadId,
                    targetText: 'soft cadence',
                    suggestedText: 'sharper rhythm',
                    rationale: 'Make the sentence land with more precision.'
                  }
                }]
              }
            }

            return {
              id: 'msg_suggestion_done',
              role: 'assistant',
              stop_reason: 'end_turn',
              content: [{
                type: 'text',
                text: 'Suggestion ready.'
              }]
            }
          }
        }
      },
      model: 'flowrite-test-model'
    }
  }
`

test.describe('Flowrite suggestions', () => {
  test('requests and accepts a rewrite suggestion from the margin popover', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-suggestions-accept-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n', 'utf8')
    await fs.writeFile(clientModulePath, buildClientModule(), 'utf8')

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

      await selectTextInEditor(page, 'soft cadence')
      await page.locator('[data-testid="flowrite-selection-comment-button"]').click()
      await page.locator('[data-testid="flowrite-margin-popover-input"]').fill('Make this clearer.')
      await page.locator('[data-testid="flowrite-margin-popover-suggest"]').click()

      await expect(page.locator('[data-testid="flowrite-suggestion-card"]').first()).toBeVisible()
      await expect(page.locator('[data-testid="flowrite-suggestion-text"]').first()).toContainText('sharper rhythm')

      await page.locator('[data-testid="flowrite-suggestion-accept"]').first().click()
      await expect(page.locator('[data-testid="flowrite-margin-thread"]').first()).toContainText('Applied, waiting for save')
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('rejects a rewrite suggestion from the margin thread', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-suggestions-reject-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n', 'utf8')
    await fs.writeFile(clientModulePath, buildClientModule(), 'utf8')

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

      await selectTextInEditor(page, 'soft cadence')
      await page.locator('[data-testid="flowrite-selection-comment-button"]').click()
      await page.locator('[data-testid="flowrite-margin-popover-input"]').fill('Make this clearer.')
      await page.locator('[data-testid="flowrite-margin-popover-suggest"]').click()

      await expect(page.locator('[data-testid="flowrite-suggestion-card"]').first()).toBeVisible()
      await page.locator('[data-testid="flowrite-suggestion-reject"]').first().click()
      await expect(page.locator('[data-testid="flowrite-suggestion-card"]')).toHaveCount(0)
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

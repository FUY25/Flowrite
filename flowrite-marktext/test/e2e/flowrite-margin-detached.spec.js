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

const replaceParagraphText = async (page, targetText, replacementText) => {
  await page.evaluate(({ text, replacement }) => {
    const editorRoot = document.querySelector('.editor-wrapper')
    const editorVm = editorRoot && editorRoot.__vue__
    if (!editorVm || !editorVm.editor || !editorVm.currentFile || typeof editorVm.currentFile.markdown !== 'string') {
      throw new Error('Unable to access the live editor instance for markdown replacement.')
    }

    const currentMarkdown = editorVm.currentFile.markdown
    if (!currentMarkdown.includes(text)) {
      throw new Error(`Unable to find "${text}" in the current markdown.`)
    }

    const nextMarkdown = currentMarkdown.replace(text, replacement)
    editorVm.editor.setMarkdown(nextMarkdown)
  }, {
    text: targetText,
    replacement: replacementText
  })
}

test.describe('Flowrite detached margin comments', () => {
  test('marks a margin thread detached after a destructive rewrite removes the anchored quote', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-margin-comments-detached-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n', 'utf8')
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

      await selectTextInEditor(page, 'reflective paragraph')
      await expect(page.locator('[data-testid="flowrite-selection-comment-button"]')).toBeVisible()

      await page.locator('[data-testid="flowrite-selection-comment-button"]').click()
      await expect(page.locator('[data-testid="flowrite-margin-thread-composer"]')).toBeVisible()

      await page.locator('[data-testid="flowrite-margin-thread-input"]').fill('Keep track of this thought.')
      await page.locator('[data-testid="flowrite-margin-thread-submit"]').click()

      const thread = page.locator('[data-testid="flowrite-margin-thread"]').first()
      await expect(thread).toContainText('reflective paragraph')
      await expect(thread).toContainText('Keep track of this thought.')
      await expect(thread.locator('[data-testid="flowrite-margin-thread-status"]')).toContainText('Attached')

      await replaceParagraphText(page, 'reflective paragraph', 'An abrupt closing line about thunder and gravel.')
      await page.waitForTimeout(1000)

      await expect(thread.locator('[data-testid="flowrite-margin-thread-status"]')).toContainText('Detached')

      await page.mouse.move(220, 6)
      await page.waitForTimeout(150)
      await page.locator('[data-testid="flowrite-annotations-toggle"]').click()
      await expect(thread).toBeHidden()
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

const os = require('os')
const path = require('path')
const fs = require('fs/promises')
const { expect, test } = require('@playwright/test')
const { closeElectron, launchElectron } = require('./helpers')

const waitForRendererIdle = async page => {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(750)
}

test.describe('Flowrite AI Review', () => {
  test('runs a document-wide review from have-a-look and adds multiple review comments', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-ai-review-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')
    const anchorFilePath = path.join(tempRoot, 'review-anchor.json')

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
                    id: 'msg_review_tool_1',
                    role: 'assistant',
                    stop_reason: 'tool_use',
                    content: [
                      {
                        type: 'tool_use',
                        id: 'toolu_review_1',
                        name: 'create_comment',
                        input: {
                          threadId: 'global-thread',
                          scope: 'global',
                          body: 'Review comment one: the opening gesture feels more atmospheric than specific.'
                        }
                      },
                      {
                        type: 'tool_use',
                        id: 'toolu_review_2',
                        name: 'create_comment',
                        input: {
                          scope: 'margin',
                          anchor: marginAnchor,
                          body: 'Margin review: the second paragraph names uncertainty, but the concrete pressure still feels blurred.'
                        }
                      }
                    ]
                  }
                }

                await new Promise(resolve => setTimeout(resolve, 800))

                return {
                  id: 'msg_review_done',
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
      const reviewParagraph = await page.evaluate(() => {
        const paragraphs = Array.from(document.querySelectorAll('#ag-editor-id .ag-paragraph[id]'))
        const paragraph = paragraphs.find(node => (node.textContent || '').includes('A second paragraph lands without enough concrete pressure.'))
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
      })
      expect(reviewParagraph).not.toBeNull()
      await fs.writeFile(anchorFilePath, JSON.stringify(reviewParagraph), 'utf8')

      await expect(page.locator('[data-testid="flowrite-toolbar"]')).toBeVisible()
      await page.locator('[data-testid="flowrite-have-a-look-button"]').click()
      await expect(page.locator('[data-testid="flowrite-have-a-look-popover"]')).toBeVisible()
      await page.locator('[data-testid="flowrite-have-a-look-popover"]').getByRole('button', { name: 'Critical' }).click()
      await page.locator('[data-testid="flowrite-have-a-look-go"]').click()

      await expect(page.locator('[data-testid="flowrite-have-a-look-button"]')).toContainText('Reviewing...')
      await expect(page.locator('[data-testid="flowrite-have-a-look-prompt"]')).toBeDisabled()
      await expect(page.locator('[data-testid="flowrite-have-a-look-go"]')).toBeDisabled()
      await expect(page.locator('[data-testid="flowrite-have-a-look-status"]')).toContainText('Flowrite is reviewing the whole draft...')
      await expect(page.locator('.flowrite-global-comments__status')).toContainText('Flowrite is reviewing the whole draft...')

      await expect(page.locator('[data-testid="flowrite-comment-body"]')).toContainText(
        'Review comment one: the opening gesture feels more atmospheric than specific.'
      )
      await expect(page.locator('[data-testid="flowrite-margin-thread"]')).toContainText(
        'Margin review: the second paragraph names uncertainty, but the concrete pressure still feels blurred.'
      )
      await expect(page.locator('[data-testid="flowrite-margin-dot"]')).toBeVisible()
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

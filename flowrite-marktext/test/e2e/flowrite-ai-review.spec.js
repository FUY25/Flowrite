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

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with too many unresolved turns.\n', 'utf8')
    await fs.writeFile(clientModulePath, `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        let callCount = 0
        return {
          client: {
            messages: {
              create: async function create () {
                callCount += 1
                if (callCount === 1) {
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
                          threadId: 'global-thread',
                          scope: 'global',
                          body: 'Review comment two: the paragraph hints at conflict but never names the pressure clearly.'
                        }
                      }
                    ]
                  }
                }

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

      await expect(page.locator('[data-testid="flowrite-toolbar"]')).toBeVisible()
      await page.locator('[data-testid="flowrite-have-a-look-button"]').click()
      await expect(page.locator('[data-testid="flowrite-have-a-look-popover"]')).toBeVisible()
      await page.locator('[data-testid="flowrite-have-a-look-popover"]').getByRole('button', { name: 'Critical' }).click()
      await page.locator('[data-testid="flowrite-have-a-look-go"]').click()

      await expect(page.locator('[data-testid="flowrite-comment-body"]')).toContainText([
        'Review comment one: the opening gesture feels more atmospheric than specific.',
        'Review comment two: the paragraph hints at conflict but never names the pressure clearly.'
      ])
    } finally {
      try {
        await closeElectron(app)
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

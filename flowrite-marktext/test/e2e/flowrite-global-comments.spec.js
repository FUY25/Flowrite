const os = require('os')
const path = require('path')
const fs = require('fs/promises')
const { expect, test } = require('@playwright/test')
const { closeElectron, launchElectron } = require('./helpers')

const waitForRendererIdle = async page => {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

test.describe('Flowrite global comments', () => {
  test('submits a bottom discussion comment, receives an AI reply, and persists after reload', async () => {
    test.setTimeout(60000)
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-global-comments-'))
    const userDataDir = path.join(tempRoot, 'user-data')
    const articlePath = path.join(tempRoot, 'draft.md')
    const clientModulePath = path.join(tempRoot, 'flowrite-test-client.js')

    await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph.\n', 'utf8')
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
                    id: 'msg_tool_1',
                    role: 'assistant',
                    stop_reason: 'tool_use',
                    content: [{
                      type: 'tool_use',
                      id: 'toolu_1',
                      name: 'create_comment',
                      input: {
                        threadId: 'global-thread',
                        scope: 'global',
                        body: 'AI reply: expand the emotional turn in the last sentence.'
                      }
                    }]
                  }
                }

                return {
                  id: 'msg_tool_2',
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
      let launched = await launchElectron([articlePath], launchOptions)
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)

      const discussion = page.locator('[data-testid="flowrite-global-comments"]')
      const composer = page.locator('[data-testid="flowrite-global-comments-input"]')
      const submit = page.locator('[data-testid="flowrite-global-comments-submit"]')

      await expect(discussion).toBeVisible()
      await composer.fill('Can you help me sharpen the ending?')
      await submit.click()

      await expect(page.locator('[data-testid="flowrite-comment-body"]')).toContainText([
        'Can you help me sharpen the ending?',
        'AI reply: expand the emotional turn in the last sentence.'
      ])

      await closeElectron(app)
      launched = await launchElectron([articlePath], launchOptions)
      app = launched.app
      page = launched.page

      await waitForRendererIdle(page)

      const persistedBodies = page.locator('[data-testid="flowrite-comment-body"]')
      await expect(persistedBodies).toContainText([
        'Can you help me sharpen the ending?',
        'AI reply: expand the emotional turn in the last sentence.'
      ])
    } finally {
      try {
        if (app) {
          await closeElectron(app)
        }
      } catch (error) {}
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  })
})

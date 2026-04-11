const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test.describe('Check Launch MarkText', async () => {
  let app = null
  let page = null

  test.beforeAll(async () => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('Empty MarkText', async () => {
    const title = await page.title()
    const launchState = await page.evaluate(() => ({
      hash: window.location.hash,
      paragraphCount: document.querySelectorAll('#ag-editor-id .ag-paragraph[id]').length
    }))
    expect(/^MarkText|Untitled-1 - MarkText$/.test(title)).toBeTruthy()
    expect(launchState.hash).toBe('#/editor')
    expect(launchState.paragraphCount).toBeGreaterThan(0)
  })
})

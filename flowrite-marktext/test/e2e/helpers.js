const os = require('os')
const path = require('path')
const { _electron } = require('playwright')

const mainEntrypoint = 'dist/electron/main.js'

const getDateAsFilename = () => {
  const date = new Date()
  return '' + date.getFullYear() + (date.getMonth() + 1) + date.getDay()
}

const getTempPath = () => {
  const name = 'marktext-e2etest-' + getDateAsFilename()
  return path.join(os.tmpdir(), name)
}

const getElectronPath = () => {
  return require('electron')
}

const getEditorReadyState = async page => {
  return page.evaluate(() => ({
    href: window.location.href,
    hash: window.location.hash,
    readyState: document.readyState,
    paragraphCount: document.querySelectorAll('#ag-editor-id .ag-paragraph[id]').length,
    bodyText: document.body ? document.body.innerText.slice(0, 200) : ''
  }))
}

const ensureEditorReady = async (page, options = {}) => {
  const { timeout = 30000 } = options

  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => window.location.hash === '#/editor', {}, { timeout })
  await page.waitForFunction(() => document.querySelectorAll('#ag-editor-id .ag-paragraph[id]').length > 0, {}, { timeout })
}

const launchElectron = async (userArgs, options = {}) => {
  userArgs = userArgs || []
  const {
    userDataDir = getTempPath(),
    env = {},
    waitForEditor = true
  } = options
  const executablePath = getElectronPath()
  const args = [mainEntrypoint, '--user-data-dir', userDataDir].concat(userArgs)
  const app = await _electron.launch({
    executablePath,
    args,
    env: {
      ...process.env,
      ...env
    },
    timeout: 30000
  })
  let [page] = app.windows()
  if (!page) {
    page = await app.waitForEvent('window', { timeout: 30000 })
  }
  await page.waitForLoadState('domcontentloaded')
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (waitForEditor) {
    try {
      await ensureEditorReady(page)
    } catch (error) {
      const details = await getEditorReadyState(page).catch(() => null)
      const diagnostic = details ? ` ${JSON.stringify(details)}` : ''
      throw new Error(`Electron app did not initialize the editor window.${diagnostic}`)
    }
  }

  return { app, page }
}

const closeElectron = async (app) => {
  if (!app) {
    return
  }

  try {
    await app.evaluate(async ({ app: electronApp }) => {
      electronApp.quit()
    })
  } catch (error) {}

  try {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
  } catch (error) {}

  let child = null
  try {
    child = typeof app.process === 'function' ? app.process() : null
  } catch (error) {
    child = null
  }
  if (child && !child.killed) {
    try {
      child.kill('SIGKILL')
    } catch (error) {}
  }
}

module.exports = { getElectronPath, launchElectron, closeElectron, ensureEditorReady }

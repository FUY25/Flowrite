import fs from 'fs'
import path from 'path'
import EventEmitter from 'events'
import { BrowserWindow, ipcMain, dialog, safeStorage, net } from 'electron'
import keytar from 'keytar'
import schema from './schema'
import Store from 'electron-store'
import log from 'electron-log'
import { ensureDirSync } from 'common/filesystem'
import { IMAGE_EXTENSIONS } from 'common/filesystem/paths'
import { FlowriteSettings } from '../flowrite/settings/flowriteSettings'
import FlowriteControllerBridge from '../flowrite/controller'
import { getOnlineStatus } from '../flowrite/network/status'
import { loadDocumentRecord } from '../flowrite/files/documentStore'
import { loadComments } from '../flowrite/files/commentsStore'
import { loadSuggestions } from '../flowrite/files/suggestionsStore'

const DATA_CENTER_NAME = 'dataCenter'

class DataCenter extends EventEmitter {
  constructor (paths) {
    super()

    const { dataCenterPath, userDataPath } = paths
    this.dataCenterPath = dataCenterPath
    this.userDataPath = userDataPath
    this.serviceName = 'marktext'
    this.encryptKeys = ['githubToken']
    this.hasDataCenterFile = fs.existsSync(path.join(this.dataCenterPath, `./${DATA_CENTER_NAME}.json`))
    this.store = new Store({
      schema,
      name: DATA_CENTER_NAME
    })
    this.flowriteSettings = new FlowriteSettings({
      store: this.store,
      safeStorage,
      getOnlineStatus: () => getOnlineStatus({ net })
    })
    this.flowriteController = new FlowriteControllerBridge({
      flowriteSettings: this.flowriteSettings
    })

    this.init()
  }

  init () {
    const defaultData = {
      imageFolderPath: path.join(this.userDataPath, 'images'),
      screenshotFolderPath: path.join(this.userDataPath, 'screenshot'),
      webImages: [],
      cloudImages: [],
      currentUploader: 'none',
      imageBed: {
        github: {
          owner: '',
          repo: '',
          branch: ''
        }
      }
    }

    if (!this.hasDataCenterFile) {
      this.store.set(defaultData)
      ensureDirSync(this.store.get('screenshotFolderPath'))
    }
    this._listenForIpcMain()
  }

  async getAll () {
    const { serviceName, encryptKeys } = this
    const data = {
      ...this.store.store
    }
    delete data.flowrite
    try {
      const encryptData = await Promise.all(encryptKeys.map(key => {
        return keytar.getPassword(serviceName, key)
      }))
      const encryptObj = encryptKeys.reduce((acc, k, i) => {
        return {
          ...acc,
          [k]: encryptData[i]
        }
      }, {})

      return {
        ...data,
        ...encryptObj,
        flowrite: this.flowriteSettings.getPublicState()
      }
    } catch (err) {
      log.error('Failed to decrypt secure keys:', err)
      return {
        ...data,
        flowrite: this.flowriteSettings.getPublicState()
      }
    }
  }

  addImage (key, url) {
    const items = this.store.get(key)
    const alreadyHas = items.some(item => item.url === url)
    let item
    if (alreadyHas) {
      item = items.find(item => item.url === url)
      item.timeStamp = +new Date()
    } else {
      item = {
        url,
        timeStamp: +new Date()
      }
      items.push(item)
    }

    ipcMain.emit('broadcast-web-image-added', { type: key, item })
    return this.store.set(key, items)
  }

  removeImage (type, url) {
    const items = this.store.get(type)
    const index = items.indexOf(url)
    const item = items[index]
    if (index === -1) return
    items.splice(index, 1)
    ipcMain.emit('broadcast-web-image-removed', { type, item })
    return this.store.set(type, items)
  }

  /**
   *
   * @param {string} key
   * return a promise
   */
  getItem (key) {
    const { encryptKeys, serviceName } = this
    if (encryptKeys.includes(key)) {
      return keytar.getPassword(serviceName, key)
    } else {
      const value = this.store.get(key)
      return Promise.resolve(value)
    }
  }

  async setItem (key, value) {
    const { encryptKeys, serviceName } = this
    if (key === 'flowrite') {
      return this.setFlowriteSettings(value)
    }
    if (key === 'screenshotFolderPath') {
      ensureDirSync(value)
    }
    ipcMain.emit('broadcast-user-data-changed', { [key]: value })
    if (encryptKeys.includes(key)) {
      try {
        return await keytar.setPassword(serviceName, key, value)
      } catch (err) {
        log.error('Keytar error:', err)
      }
    } else {
      return this.store.set(key, value)
    }
  }

  async setFlowriteSettings (settings = {}) {
    const flowrite = await this.flowriteSettings.updateSettings(settings)
    ipcMain.emit('broadcast-user-data-changed', { flowrite })
    return flowrite
  }

  async testFlowriteApiKey (settings = {}) {
    return this.flowriteSettings.testApiKey(settings)
  }

  async bootstrapFlowriteDocument (pathname) {
    const availability = this.flowriteSettings.getPublicState()

    if (!pathname) {
      return {
        document: null,
        comments: [],
        suggestions: [],
        availability,
        runtimeReady: false
      }
    }

    await this.flowriteController.reconcileSuggestionsWithMarkdown(pathname)

    const [document, comments, suggestions] = await Promise.all([
      loadDocumentRecord(pathname),
      loadComments(pathname),
      loadSuggestions(pathname)
    ])

    return {
      document,
      comments,
      suggestions,
      availability,
      runtimeReady: Boolean(availability.enabled)
    }
  }

  /**
   * Change multiple setting entries.
   *
   * @param {Object.<string, *>} settings A settings object or subset object with key/value entries.
   */
  async setItems (settings) {
    if (!settings) {
      log.error('Cannot change settings without entires: object is undefined or null.')
      return
    }

    for (const key of Object.keys(settings)) {
      await this.setItem(key, settings[key])
    }
  }

  _listenForIpcMain () {
    // local main events
    ipcMain.on('set-image-folder-path', newPath => {
      this.setItem('imageFolderPath', newPath)
    })

    // events from renderer process
    ipcMain.on('mt::ask-for-user-data', async e => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const userData = await this.getAll()
      win.webContents.send('mt::user-preference', userData)
    })

    ipcMain.on('mt::ask-for-modify-image-folder-path', async (e, imagePath) => {
      if (!imagePath) {
        const win = BrowserWindow.fromWebContents(e.sender)
        const { filePaths } = await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
        if (filePaths && filePaths[0]) {
          imagePath = filePaths[0]
        }
      }
      if (imagePath) {
        this.setItem('imageFolderPath', imagePath)
      }
    })

    ipcMain.on('mt::set-user-data', (e, userData) => {
      this.setItems(userData).catch(error => {
        log.error('Failed to apply user data update.', error)
      })
    })

    ipcMain.handle('mt::flowrite:update-settings', async (e, settings = {}) => {
      return this.setFlowriteSettings(settings)
    })

    ipcMain.handle('mt::flowrite:test-api-key', async (e, settings = {}) => {
      return this.testFlowriteApiKey(settings)
    })

    ipcMain.handle('mt::flowrite:bootstrap-document', async (e, { pathname } = {}) => {
      return this.bootstrapFlowriteDocument(pathname)
    })

    ipcMain.handle('mt::flowrite:submit-global-comment', async (e, payload = {}) => {
      const browserWindow = BrowserWindow.fromWebContents(e.sender)
      return this.flowriteController.submitGlobalComment({
        browserWindow,
        ...payload
      })
    })

    ipcMain.handle('mt::flowrite:submit-margin-comment', async (e, payload = {}) => {
      const browserWindow = BrowserWindow.fromWebContents(e.sender)
      return this.flowriteController.submitMarginComment({
        browserWindow,
        ...payload
      })
    })

    ipcMain.handle('mt::flowrite:delete-thread', async (e, payload = {}) => {
      const browserWindow = BrowserWindow.fromWebContents(e.sender)
      return this.flowriteController.deleteThread({
        browserWindow,
        ...payload
      })
    })

    ipcMain.handle('mt::flowrite:run-ai-review', async (e, payload = {}) => {
      const browserWindow = BrowserWindow.fromWebContents(e.sender)
      return this.flowriteController.runAiReview({
        browserWindow,
        ...payload
      })
    })

    ipcMain.handle('mt::flowrite:request-suggestion', async (e, payload = {}) => {
      const browserWindow = BrowserWindow.fromWebContents(e.sender)
      return this.flowriteController.requestSuggestion({
        browserWindow,
        ...payload
      })
    })

    ipcMain.handle('mt::flowrite:accept-suggestion', async (e, payload = {}) => {
      return this.flowriteController.acceptSuggestion(payload)
    })

    ipcMain.handle('mt::flowrite:reject-suggestion', async (e, payload = {}) => {
      return this.flowriteController.rejectSuggestion(payload)
    })

    ipcMain.handle('mt::flowrite:finalize-suggestions-after-save', async (e, payload = {}) => {
      return this.flowriteController.finalizeAcceptedSuggestionsAfterSave(payload)
    })

    // TODO: Replace sync. call.
    ipcMain.on('mt::ask-for-image-path', async e => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const { filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{
          name: 'Images',
          extensions: IMAGE_EXTENSIONS
        }]
      })

      if (filePaths && filePaths[0]) {
        e.returnValue = filePaths[0]
      } else {
        e.returnValue = ''
      }
    })
  }
}

export default DataCenter

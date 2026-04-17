import Vue from 'vue'
import Vuex from 'vuex'
import { expect } from 'chai'
import { createRequire } from 'module'

let ipcRenderer = {
  invoke: async () => {
    throw new Error('Unexpected ipcRenderer.invoke call in test.')
  },
  on: () => {},
  send: () => {}
}

let preferencesModule
let flowriteModule
let createDefaultFlowriteState
let registerFlowriteLifecycle

Vue.use(Vuex)

const isKarmaRuntime = () => {
  return typeof window !== 'undefined' && Boolean(window.__karma__)
}

const loadFlowriteStoreModules = async () => {
  if (isKarmaRuntime()) {
    const electronModule = await import('electron')
    ipcRenderer = electronModule.ipcRenderer

    const flowriteStoreModule = await import('../../../src/renderer/store/modules/flowrite.js')
    const preferencesStoreModule = await import('../../../src/renderer/store/preferences.js')

    return {
      preferencesModule: preferencesStoreModule.default,
      flowriteModule: flowriteStoreModule.default,
      createDefaultFlowriteState: flowriteStoreModule.createDefaultFlowriteState,
      registerFlowriteLifecycle: flowriteStoreModule.registerFlowriteLifecycle
    }
  }

  const require = createRequire(import.meta.url)
  const electronEntry = require.resolve('electron')
  const originalElectronCacheEntry = require.cache[electronEntry]
  require.cache[electronEntry] = {
    id: electronEntry,
    filename: electronEntry,
    loaded: true,
    exports: { ipcRenderer }
  }

  try {
    const flowriteStoreModule = require('../../../src/renderer/store/modules/flowrite.js')
    const preferencesStoreModule = require('../../../src/renderer/store/preferences.js')

    return {
      preferencesModule: preferencesStoreModule.default,
      flowriteModule: flowriteStoreModule.default,
      createDefaultFlowriteState: flowriteStoreModule.createDefaultFlowriteState,
      registerFlowriteLifecycle: flowriteStoreModule.registerFlowriteLifecycle
    }
  } finally {
    if (originalElectronCacheEntry) {
      require.cache[electronEntry] = originalElectronCacheEntry
    } else {
      delete require.cache[electronEntry]
    }
  }
}

const createPreferencesState = (flowrite = {}) => ({
  workspaceBackgroundWarmth: 0,
  primaryWritingFont: 'Flowrite EB Garamond',
  secondaryWritingFont: 'Flowrite Source Han Serif SC',
  discussionFont: 'system-ui',
  flowrite: {
    enabled: false,
    configured: false,
    online: true,
    firstRun: true,
    status: 'disabled',
    reason: 'unconfigured',
    baseURL: '',
    model: '',
    collaborationMode: 'comment_only',
    ...flowrite
  }
})

const cloneFlowriteModule = () => ({
  state: createDefaultFlowriteState(),
  getters: flowriteModule.getters,
  mutations: flowriteModule.mutations,
  actions: flowriteModule.actions
})

const createStore = ({ preferences, currentFile } = {}) => {
  return new Vuex.Store({
    modules: {
      editor: {
        state: {
          currentFile: currentFile || {}
        },
        mutations: {
          SET_EDITOR_CURRENT_FILE (state, nextFile) {
            state.currentFile = nextFile
          }
        }
      },
      preferences: {
        state: createPreferencesState(preferences),
        mutations: {
          ...preferencesModule.mutations,
          SET_FLOWRITE_PREFERENCE (state, nextFlowrite) {
            state.flowrite = {
              ...state.flowrite,
              ...nextFlowrite
            }
          }
        },
        actions: preferencesModule.actions
      },
      flowrite: cloneFlowriteModule()
    }
  })
}

const flushPromises = async () => {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('Flowrite renderer store', function () {
  let originalInvoke
  let originalOn
  let originalSend
  let listeners

  before(async function () {
    const loadedModules = await loadFlowriteStoreModules()
    preferencesModule = loadedModules.preferencesModule
    flowriteModule = loadedModules.flowriteModule
    createDefaultFlowriteState = loadedModules.createDefaultFlowriteState
    registerFlowriteLifecycle = loadedModules.registerFlowriteLifecycle
    originalInvoke = ipcRenderer.invoke
    originalOn = ipcRenderer.on
    originalSend = ipcRenderer.send
  })

  beforeEach(function () {
    listeners = new Map()
    ipcRenderer.invoke = async () => {
      throw new Error('Unexpected ipcRenderer.invoke call in test.')
    }
    ipcRenderer.on = (channel, handler) => {
      listeners.set(channel, handler)
    }
  })

  afterEach(function () {
    ipcRenderer.invoke = originalInvoke
    ipcRenderer.on = originalOn
    ipcRenderer.send = originalSend
  })

  it('bootstraps the current document sidecars and availability into one module', async function () {
    const store = createStore({
      preferences: {
        enabled: true,
        configured: true,
        online: true,
        status: 'ready',
        reason: null,
        baseURL: 'https://api.flowrite.test',
        model: 'claude-test'
      },
      currentFile: {
        pathname: '/notes/draft.md'
      }
    })

    const bootstrapPayload = {
      document: {
        lastSnapshotSaveCycleId: 'cycle-1',
        conversationHistory: [{ role: 'assistant', text: 'Hi' }],
        historyTokenEstimate: 42,
        responseStyle: 'comment_only',
        lastReviewPersona: 'improvement'
      },
      comments: [{ id: 'comment-1', body: 'Sharpen this opening.' }],
      suggestions: [{ id: 'suggestion-1', status: 'open' }],
      availability: {
        enabled: true,
        configured: true,
        online: false,
        firstRun: false,
        status: 'disabled',
        reason: 'offline',
        baseURL: 'https://api.flowrite.test',
        model: 'claude-test'
      },
      runtimeReady: false
    }

    const invokeCalls = []
    ipcRenderer.invoke = async (channel, payload) => {
      invokeCalls.push({ channel, payload })
      return bootstrapPayload
    }

    await store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', '/notes/draft.md')

    expect(invokeCalls).to.deep.equal([{
      channel: 'mt::flowrite:bootstrap-document',
      payload: {
        pathname: '/notes/draft.md'
      }
    }])
    expect(store.state.flowrite.pathname).to.equal('/notes/draft.md')
    expect(store.state.flowrite.document).to.deep.equal(bootstrapPayload.document)
    expect(store.state.flowrite.comments).to.deep.equal(bootstrapPayload.comments)
    expect(store.state.flowrite.suggestions).to.deep.equal(bootstrapPayload.suggestions)
    expect(store.state.flowrite.availability).to.deep.equal(bootstrapPayload.availability)
    expect(store.state.flowrite.composerMarginThread).to.equal(null)
    expect(store.state.flowrite.runtime.ready).to.equal(false)
    expect(store.state.flowrite.runtime.status).to.equal('idle')
  })

  it('opens a margin composer from the selection payload and restores the annotations pane on cancel when auto-opened', async function () {
    const store = createStore()

    const composerMarginThread = await store.dispatch('OPEN_FLOWRITE_MARGIN_COMPOSER', {
      start: {
        key: 'paragraph-1',
        offset: 2,
        blockText: 'Alpha beta gamma'
      },
      end: {
        key: 'paragraph-1',
        offset: 7,
        blockText: 'Alpha beta gamma'
      },
      quote: 'beta'
    })

    expect(composerMarginThread).to.deep.include({
      id: 'flowrite-margin-thread-composer',
      scope: 'margin',
      status: 'draft'
    })
    expect(composerMarginThread.anchor).to.include({
      quote: 'beta'
    })
    expect(store.state.flowrite.composerMarginThread).to.deep.include({
      id: 'flowrite-margin-thread-composer',
      scope: 'margin',
      status: 'draft'
    })
    expect(store.state.flowrite.activeMarginThreadId).to.equal('flowrite-margin-thread-composer')
    expect(store.state.flowrite.highlightedMarginThreadIds).to.deep.equal(['flowrite-margin-thread-composer'])
    expect(store.state.flowrite.showAnnotationsPane).to.equal(true)

    await store.dispatch('CLOSE_FLOWRITE_MARGIN_COMPOSER')
    expect(store.state.flowrite.composerMarginThread).to.equal(null)
    expect(store.state.flowrite.activeMarginThreadId).to.equal(null)
    expect(store.state.flowrite.highlightedMarginThreadIds).to.deep.equal([])
    expect(store.state.flowrite.showAnnotationsPane).to.equal(false)
  })

  it('keeps the annotations pane open after a submitted composer closes', async function () {
    const store = createStore()

    await store.dispatch('OPEN_FLOWRITE_MARGIN_COMPOSER', {
      start: {
        key: 'paragraph-1',
        offset: 2,
        blockText: 'Alpha beta gamma'
      },
      end: {
        key: 'paragraph-1',
        offset: 7,
        blockText: 'Alpha beta gamma'
      },
      quote: 'beta'
    })

    expect(store.state.flowrite.showAnnotationsPane).to.equal(true)

    await store.dispatch('CLOSE_FLOWRITE_MARGIN_COMPOSER', {
      restoreAnnotationsPane: false
    })

    expect(store.state.flowrite.composerMarginThread).to.equal(null)
    expect(store.state.flowrite.activeMarginThreadId).to.equal(null)
    expect(store.state.flowrite.highlightedMarginThreadIds).to.deep.equal([])
    expect(store.state.flowrite.showAnnotationsPane).to.equal(true)
  })

  it('activates an existing margin thread and opens the integrated margin surface without resurrecting the composer', async function () {
    const store = createStore()

    store.state.flowrite.comments = [{
      id: 'thread-margin-1',
      scope: 'margin',
      status: 'open',
      comments: [{
        id: 'comment-1',
        author: 'user',
        body: 'Keep this visible.'
      }]
    }]

    await store.dispatch('ACTIVATE_MARGIN_THREAD', 'thread-margin-1')

    expect(store.state.flowrite.activeMarginThreadId).to.equal('thread-margin-1')
    expect(store.state.flowrite.highlightedMarginThreadIds).to.deep.equal(['thread-margin-1'])
    expect(store.state.flowrite.showAnnotationsPane).to.equal(true)
    expect(store.state.flowrite.composerMarginThread).to.equal(null)
  })

  it('preserves the original pane provenance across repeated composer openings before cancel', async function () {
    const store = createStore()

    await store.dispatch('OPEN_FLOWRITE_MARGIN_COMPOSER', {
      start: {
        key: 'paragraph-1',
        offset: 2,
        blockText: 'Alpha beta gamma'
      },
      end: {
        key: 'paragraph-1',
        offset: 7,
        blockText: 'Alpha beta gamma'
      },
      quote: 'beta'
    })

    await store.dispatch('OPEN_FLOWRITE_MARGIN_COMPOSER', {
      start: {
        key: 'paragraph-1',
        offset: 8,
        blockText: 'Alpha beta gamma'
      },
      end: {
        key: 'paragraph-1',
        offset: 13,
        blockText: 'Alpha beta gamma'
      },
      quote: 'gamma'
    })

    await store.dispatch('CLOSE_FLOWRITE_MARGIN_COMPOSER')

    expect(store.state.flowrite.showAnnotationsPane).to.equal(false)
    expect(store.state.flowrite.composerMarginThread).to.equal(null)
  })

  it('clears the composer when the annotations pane is manually closed', async function () {
    const store = createStore()

    await store.dispatch('OPEN_FLOWRITE_MARGIN_COMPOSER', {
      start: {
        key: 'paragraph-1',
        offset: 2,
        blockText: 'Alpha beta gamma'
      },
      end: {
        key: 'paragraph-1',
        offset: 7,
        blockText: 'Alpha beta gamma'
      },
      quote: 'beta'
    })

    await store.dispatch('TOGGLE_FLOWRITE_ANNOTATIONS_PANE')

    expect(store.state.flowrite.showAnnotationsPane).to.equal(false)
    expect(store.state.flowrite.composerMarginThread).to.equal(null)
    expect(store.state.flowrite.activeMarginThreadId).to.equal(null)
    expect(store.state.flowrite.highlightedMarginThreadIds).to.deep.equal([])
  })

  it('hydrates collaboration mode into renderer preferences state', async function () {
    let userPreferenceHandler = null
    const sentMessages = []
    const flowritePayload = createPreferencesState({
      enabled: true,
      configured: true,
      online: false,
      firstRun: false,
      status: 'disabled',
      reason: 'offline',
      baseURL: 'https://api.flowrite.test',
      model: 'claude-test',
      collaborationMode: 'cowriting'
    }).flowrite
    ipcRenderer.send = (channel, ...args) => {
      sentMessages.push({ channel, args })
    }
    ipcRenderer.on = (channel, handler) => {
      if (channel === 'mt::user-preference') {
        userPreferenceHandler = handler
      }
    }

    const store = createStore()

    await store.dispatch('ASK_FOR_USER_PREFERENCE')
    expect(sentMessages).to.deep.equal([
      { channel: 'mt::ask-for-user-preference', args: [] },
      { channel: 'mt::ask-for-user-data', args: [] }
    ])

    userPreferenceHandler(null, {
      flowrite: flowritePayload
    })

    expect(store.state.preferences.flowrite).to.deep.equal(flowritePayload)
  })

  it('hydrates workspace background warmth into renderer preferences state', async function () {
    const store = createStore()
    const nextPreferences = {
      workspaceBackgroundWarmth: 42
    }

    store.commit('SET_USER_PREFERENCE', nextPreferences)

    expect(store.state.preferences.workspaceBackgroundWarmth).to.equal(42)
  })

  it('hydrates writing and discussion typography preferences into renderer state', async function () {
    const store = createStore()
    const nextPreferences = {
      primaryWritingFont: 'Times New Roman',
      secondaryWritingFont: 'Songti SC',
      discussionFont: 'PingFang SC'
    }

    store.commit('SET_USER_PREFERENCE', nextPreferences)

    expect(store.state.preferences.primaryWritingFont).to.equal('Times New Roman')
    expect(store.state.preferences.secondaryWritingFont).to.equal('Songti SC')
    expect(store.state.preferences.discussionFont).to.equal('PingFang SC')
  })

  it('sends the collaboration mode update through the renderer preference action', async function () {
    const sentMessages = []
    ipcRenderer.send = (channel, ...args) => {
      sentMessages.push({ channel, args })
    }

    const store = createStore()

    await store.dispatch('SET_USER_DATA', {
      type: 'flowrite',
      value: {
        collaborationMode: 'cowriting'
      }
    })

    expect(sentMessages).to.deep.equal([{
      channel: 'mt::set-user-data',
      args: [{
        flowrite: {
          collaborationMode: 'cowriting'
        }
      }]
    }])
  })

  it('reloads sidecars when the active markdown file changes and resets on unsaved files', async function () {
    const bootstrapByPath = {
      '/notes/first.md': {
        document: { lastReviewPersona: 'improvement' },
        comments: [{ id: 'comment-first' }],
        suggestions: [{ id: 'suggestion-first' }],
        availability: {
          enabled: true,
          configured: true,
          online: true,
          firstRun: false,
          status: 'ready',
          reason: null,
          baseURL: '',
          model: 'claude-test'
        },
        runtimeReady: true
      },
      '/notes/second.md': {
        document: { lastReviewPersona: 'proofread' },
        comments: [{ id: 'comment-second' }],
        suggestions: [{ id: 'suggestion-second' }],
        availability: {
          enabled: true,
          configured: true,
          online: false,
          firstRun: false,
          status: 'disabled',
          reason: 'offline',
          baseURL: '',
          model: 'claude-test'
        },
        runtimeReady: false
      }
    }

    const invokeCalls = []
    ipcRenderer.invoke = async (channel, payload) => {
      invokeCalls.push({ channel, payload })
      return bootstrapByPath[payload.pathname]
    }

    const store = createStore({
      preferences: {
        enabled: true,
        configured: true,
        online: true,
        status: 'ready',
        reason: null,
        model: 'claude-test'
      }
    })

    registerFlowriteLifecycle(store)

    store.commit('SET_EDITOR_CURRENT_FILE', { pathname: '/notes/first.md' })
    await flushPromises()
    expect(store.state.flowrite.pathname).to.equal('/notes/first.md')
    expect(store.state.flowrite.comments).to.deep.equal([{ id: 'comment-first' }])
    expect(store.state.flowrite.runtime.ready).to.equal(true)

    store.commit('SET_EDITOR_CURRENT_FILE', { pathname: '/notes/second.md' })
    await flushPromises()
    expect(store.state.flowrite.pathname).to.equal('/notes/second.md')
    expect(store.state.flowrite.comments).to.deep.equal([{ id: 'comment-second' }])
    expect(store.state.flowrite.suggestions).to.deep.equal([{ id: 'suggestion-second' }])
    expect(store.state.flowrite.availability.reason).to.equal('offline')
    expect(store.state.flowrite.runtime.ready).to.equal(false)

    store.commit('SET_EDITOR_CURRENT_FILE', {})
    await flushPromises()
    expect(store.state.flowrite.pathname).to.equal('')
    expect(store.state.flowrite.document).to.equal(null)
    expect(store.state.flowrite.comments).to.deep.equal([])
    expect(store.state.flowrite.suggestions).to.deep.equal([])
    expect(store.state.flowrite.composerMarginThread).to.equal(null)
    expect(store.state.flowrite.runtime.ready).to.equal(false)

    expect(invokeCalls).to.deep.equal([
      {
        channel: 'mt::flowrite:bootstrap-document',
        payload: { pathname: '/notes/first.md' }
      },
      {
        channel: 'mt::flowrite:bootstrap-document',
        payload: { pathname: '/notes/second.md' }
      }
    ])
  })

  it('clears stale document state and records a bootstrap failure when switching files fails', async function () {
    const responses = {
      '/notes/first.md': {
        document: { lastReviewPersona: 'improvement' },
        comments: [{ id: 'comment-first' }],
        suggestions: [{ id: 'suggestion-first' }],
        availability: createPreferencesState({
          enabled: true,
          configured: true,
          online: true,
          firstRun: false,
          status: 'ready',
          reason: null,
          model: 'claude-test'
        }).flowrite,
        runtimeReady: true
      }
    }

    ipcRenderer.invoke = async (channel, payload) => {
      if (payload.pathname === '/notes/second.md') {
        throw new Error('bootstrap failed')
      }
      return responses[payload.pathname]
    }

    const store = createStore({
      preferences: {
        enabled: true,
        configured: true,
        online: true,
        firstRun: false,
        status: 'ready',
        reason: null,
        model: 'claude-test'
      }
    })

    registerFlowriteLifecycle(store)

    store.commit('SET_EDITOR_CURRENT_FILE', { pathname: '/notes/first.md' })
    await flushPromises()
    expect(store.state.flowrite.comments).to.deep.equal([{ id: 'comment-first' }])

    store.commit('SET_EDITOR_CURRENT_FILE', { pathname: '/notes/second.md' })
    await flushPromises()

    expect(store.state.flowrite.pathname).to.equal('/notes/second.md')
    expect(store.state.flowrite.document).to.equal(null)
    expect(store.state.flowrite.comments).to.deep.equal([])
    expect(store.state.flowrite.suggestions).to.deep.equal([])
    expect(store.state.flowrite.runtime.status).to.equal('failed')
    expect(store.state.flowrite.runtime.phase).to.equal('bootstrap')
    expect(store.state.flowrite.runtime.error).to.deep.include({
      message: 'bootstrap failed'
    })
  })

  it('tracks runtime progress and exposes in-flight anchors for text locking', async function () {
    const store = createStore()

    await store.dispatch('UPDATE_FLOWRITE_RUNTIME_PROGRESS', {
      requestId: 'req-1',
      status: 'running',
      phase: 'tool_call',
      ready: true,
      inFlightAnchors: [{
        anchorId: 'anchor-1',
        startKey: 'p1',
        endKey: 'p1'
      }]
    })

    expect(store.state.flowrite.runtime).to.include({
      requestId: 'req-1',
      status: 'running',
      phase: 'tool_call',
      ready: true
    })
    expect(store.state.flowrite.inFlightAnchors).to.deep.equal([{
      anchorId: 'anchor-1',
      startKey: 'p1',
      endKey: 'p1'
    }])

    await store.dispatch('UPDATE_FLOWRITE_RUNTIME_PROGRESS', {
      requestId: 'req-1',
      status: 'completed',
      phase: 'idle'
    })

    expect(store.state.flowrite.runtime.status).to.equal('completed')
    expect(store.state.flowrite.inFlightAnchors).to.deep.equal([])
  })

  it('rebootstraps the active document when Flowrite availability changes without a file switch', async function () {
    const invokeCalls = []
    let availability = {
      enabled: false,
      configured: false,
      online: true,
      firstRun: true,
      status: 'disabled',
      reason: 'unconfigured',
      baseURL: '',
      model: 'claude-test'
    }

    ipcRenderer.invoke = async (channel, payload) => {
      invokeCalls.push({ channel, payload })
      return {
        document: { lastReviewPersona: 'improvement' },
        comments: [],
        suggestions: [],
        availability,
        runtimeReady: Boolean(availability.enabled)
      }
    }

    const store = createStore({
      currentFile: {
        pathname: '/notes/draft.md'
      },
      preferences: availability
    })

    registerFlowriteLifecycle(store)
    await store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', '/notes/draft.md')
    expect(store.state.flowrite.availability.enabled).to.equal(false)

    availability = {
      enabled: true,
      configured: true,
      online: true,
      firstRun: false,
      status: 'ready',
      reason: null,
      baseURL: '',
      model: 'claude-test'
    }

    store.commit('SET_FLOWRITE_PREFERENCE', availability)
    await flushPromises()

    expect(invokeCalls).to.have.length(2)
    expect(store.state.flowrite.pathname).to.equal('/notes/draft.md')
    expect(store.state.flowrite.availability.enabled).to.equal(true)
    expect(store.state.flowrite.availability.status).to.equal('ready')
    expect(store.state.flowrite.runtime.ready).to.equal(true)
  })

  it('ignores stale same-path bootstrap responses when a newer rebootstrap finishes first', async function () {
    const pendingResponses = []
    ipcRenderer.invoke = async () => {
      return new Promise(resolve => {
        pendingResponses.push(resolve)
      })
    }

    const store = createStore({
      currentFile: {
        pathname: '/notes/draft.md'
      },
      preferences: {
        enabled: true,
        configured: true,
        online: true,
        firstRun: false,
        status: 'ready',
        reason: null,
        model: 'claude-test'
      }
    })

    const firstBootstrap = store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', '/notes/draft.md')
    const secondBootstrap = store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', '/notes/draft.md')

    pendingResponses[1]({
      document: { lastReviewPersona: 'improvement' },
      comments: [{ id: 'comment-new' }],
      suggestions: [{ id: 'suggestion-new' }],
      availability: createPreferencesState({
        enabled: true,
        configured: true,
        online: true,
        firstRun: false,
        status: 'ready',
        reason: null,
        model: 'claude-test'
      }).flowrite,
      runtimeReady: true
    })
    await flushPromises()

    pendingResponses[0]({
      document: { lastReviewPersona: 'critical' },
      comments: [{ id: 'comment-old' }],
      suggestions: [{ id: 'suggestion-old' }],
      availability: createPreferencesState({
        enabled: false,
        configured: true,
        online: false,
        firstRun: false,
        status: 'disabled',
        reason: 'offline',
        model: 'claude-test'
      }).flowrite,
      runtimeReady: false
    })
    await Promise.all([firstBootstrap, secondBootstrap])

    expect(store.state.flowrite.comments).to.deep.equal([{ id: 'comment-new' }])
    expect(store.state.flowrite.suggestions).to.deep.equal([{ id: 'suggestion-new' }])
    expect(store.state.flowrite.availability.status).to.equal('ready')
    expect(store.state.flowrite.runtime.ready).to.equal(true)
  })

  it('optimistically refreshes threads after tool-driven state updates', async function () {
    const store = createStore({
      currentFile: {
        pathname: '/notes/draft.md'
      }
    })

    store.commit('APPLY_FLOWRITE_BOOTSTRAP', {
      pathname: '/notes/draft.md',
      document: {
        conversationHistory: [{ role: 'user', text: 'Help me revise this.' }],
        historyTokenEstimate: 22,
        responseStyle: 'comment_only',
        lastReviewPersona: 'improvement'
      },
      comments: [{ id: 'comment-old', body: 'Old comment' }],
      suggestions: [{ id: 'suggestion-old', status: 'open' }],
      availability: createPreferencesState().flowrite,
      runtimeReady: true
    })

    await store.dispatch('APPLY_FLOWRITE_THREAD_REFRESH', {
      pathname: '/notes/draft.md',
      document: {
        lastSnapshotSaveCycleId: 'cycle-2'
      },
      comments: [{ id: 'comment-new', body: 'Fresh feedback' }],
      suggestions: [{ id: 'suggestion-new', status: 'accepted' }]
    })

    expect(store.state.flowrite.document).to.deep.equal({
      conversationHistory: [{ role: 'user', text: 'Help me revise this.' }],
      historyTokenEstimate: 22,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement',
      lastSnapshotSaveCycleId: 'cycle-2'
    })
    expect(store.state.flowrite.comments).to.deep.equal([{ id: 'comment-new', body: 'Fresh feedback' }])
    expect(store.state.flowrite.suggestions).to.deep.equal([{ id: 'suggestion-new', status: 'accepted' }])
  })

  it('ignores refresh payloads for stale pathnames', async function () {
    const store = createStore({
      currentFile: {
        pathname: '/notes/second.md'
      }
    })

    store.commit('APPLY_FLOWRITE_BOOTSTRAP', {
      pathname: '/notes/second.md',
      document: {
        lastReviewPersona: 'improvement'
      },
      comments: [{ id: 'comment-active', body: 'Active comment' }],
      suggestions: [{ id: 'suggestion-active', status: 'open' }],
      availability: createPreferencesState().flowrite,
      runtimeReady: true
    })

    await store.dispatch('APPLY_FLOWRITE_THREAD_REFRESH', {
      pathname: '/notes/first.md',
      document: {
        lastSnapshotSaveCycleId: 'cycle-stale'
      },
      comments: [{ id: 'comment-stale', body: 'Stale comment' }],
      suggestions: [{ id: 'suggestion-stale', status: 'accepted' }]
    })

    expect(store.state.flowrite.pathname).to.equal('/notes/second.md')
    expect(store.state.flowrite.document).to.deep.equal({
      lastReviewPersona: 'improvement'
    })
    expect(store.state.flowrite.comments).to.deep.equal([{ id: 'comment-active', body: 'Active comment' }])
    expect(store.state.flowrite.suggestions).to.deep.equal([{ id: 'suggestion-active', status: 'open' }])
  })

  it('deletes a margin thread through IPC and refreshes comments and suggestions in the renderer store', async function () {
    const store = createStore({
      currentFile: {
        pathname: '/notes/draft.md'
      }
    })

    store.commit('APPLY_FLOWRITE_BOOTSTRAP', {
      pathname: '/notes/draft.md',
      document: { lastReviewPersona: 'improvement' },
      comments: [{ id: 'thread-old', scope: 'margin' }],
      suggestions: [],
      availability: createPreferencesState().flowrite,
      runtimeReady: true
    })

    const invokeCalls = []
    ipcRenderer.invoke = async (channel, payload) => {
      invokeCalls.push({ channel, payload })
      return {
        deleted: true,
        pathname: '/notes/draft.md',
        comments: [{ id: 'thread-keep', scope: 'margin' }],
        suggestions: [{ id: 'suggestion-keep', threadId: 'thread-keep' }]
      }
    }

    const result = await store.dispatch('DELETE_FLOWRITE_THREAD', {
      threadId: 'thread-delete-me'
    })

    expect(invokeCalls).to.deep.equal([{
      channel: 'mt::flowrite:delete-thread',
      payload: {
        pathname: '/notes/draft.md',
        threadId: 'thread-delete-me',
        scope: 'margin'
      }
    }])
    expect(result).to.deep.equal({
      deleted: true,
      pathname: '/notes/draft.md',
      comments: [{ id: 'thread-keep', scope: 'margin' }],
      suggestions: [{ id: 'suggestion-keep', threadId: 'thread-keep' }]
    })
    expect(store.state.flowrite.comments).to.deep.equal([
      { id: 'thread-keep', scope: 'margin' }
    ])
    expect(store.state.flowrite.suggestions).to.deep.equal([
      { id: 'suggestion-keep', threadId: 'thread-keep' }
    ])
  })

  it('ignores stale delete-thread results after the active file changes', async function () {
    const store = createStore({
      currentFile: {
        pathname: '/notes/first.md'
      }
    })

    store.commit('APPLY_FLOWRITE_BOOTSTRAP', {
      pathname: '/notes/first.md',
      document: { lastReviewPersona: 'improvement' },
      comments: [{ id: 'thread-first', scope: 'margin' }],
      suggestions: [{ id: 'suggestion-first', status: 'open' }],
      availability: createPreferencesState().flowrite,
      runtimeReady: true
    })

    let resolveDelete
    ipcRenderer.invoke = async () => {
      return new Promise(resolve => {
        resolveDelete = resolve
      })
    }

    const deletePromise = store.dispatch('DELETE_FLOWRITE_THREAD', {
      threadId: 'thread-delete-me'
    })

    store.commit('SET_EDITOR_CURRENT_FILE', { pathname: '/notes/second.md' })
    store.commit('APPLY_FLOWRITE_BOOTSTRAP', {
      pathname: '/notes/second.md',
      document: { lastReviewPersona: 'proofread' },
      comments: [{ id: 'thread-second', scope: 'margin' }],
      suggestions: [{ id: 'suggestion-second', status: 'open' }],
      availability: createPreferencesState().flowrite,
      runtimeReady: true
    })

    resolveDelete({
      deleted: true,
      pathname: '/notes/first.md',
      comments: [{ id: 'thread-keep', scope: 'margin' }],
      suggestions: [{ id: 'suggestion-keep', threadId: 'thread-keep' }]
    })

    const result = await deletePromise

    expect(result.pathname).to.equal('/notes/first.md')
    expect(store.state.flowrite.pathname).to.equal('/notes/second.md')
    expect(store.state.flowrite.comments).to.deep.equal([
      { id: 'thread-second', scope: 'margin' }
    ])
    expect(store.state.flowrite.suggestions).to.deep.equal([
      { id: 'suggestion-second', status: 'open' }
    ])
  })
})

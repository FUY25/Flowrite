import { ipcRenderer } from 'electron'
import bus from '../../bus'
import notice from '../../services/notification'
import { createMarginAnchor } from '../../../flowrite/anchors'
import {
  TERMINAL_RUNTIME_STATUSES,
  RUNTIME_STATUS_IDLE,
  RUNTIME_STATUS_FAILED,
  RUNTIME_STATUS_COMPLETED,
  PHASE_IDLE,
  PHASE_BOOTSTRAP,
  PHASE_AI_REVIEW,
  SCOPE_MARGIN
} from '../../../flowrite/constants'

const cloneArray = value => {
  return Array.isArray(value) ? value.slice() : []
}

const normalizeAvailability = (availability = {}) => {
  return {
    enabled: Boolean(availability.enabled),
    configured: Boolean(availability.configured),
    online: typeof availability.online === 'boolean' ? availability.online : true,
    firstRun: typeof availability.firstRun === 'boolean' ? availability.firstRun : true,
    status: availability.status || 'disabled',
    reason: Object.prototype.hasOwnProperty.call(availability, 'reason') ? availability.reason : 'unconfigured',
    baseURL: availability.baseURL || '',
    model: availability.model || ''
  }
}

const createRuntimeState = ({ ready = false } = {}) => ({
  ready,
  requestId: null,
  status: RUNTIME_STATUS_IDLE,
  phase: PHASE_IDLE,
  message: '',
  error: null
})

const normalizeError = error => {
  if (!error) {
    return null
  }

  return {
    code: error.code || null,
    message: error.message || String(error)
  }
}

const getCurrentEditorPathname = rootState => {
  return rootState.editor && rootState.editor.currentFile
    ? rootState.editor.currentFile.pathname || ''
    : ''
}

const shouldIgnoreThreadRefresh = (rootState, payloadPathname) => {
  return Boolean(payloadPathname) && getCurrentEditorPathname(rootState) !== payloadPathname
}

const createSaveCycleId = () => `flowrite-save-cycle-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

export const createDefaultFlowriteState = () => ({
  pathname: '',
  bootstrapRequestId: 0,
  document: null,
  comments: [],
  suggestions: [],
  showAnnotationsPane: false,
  activeMarginThreadId: null,
  composerMarginThread: null,
  highlightedMarginThreadIds: [],
  composerMarginThreadWasAnnotationsPaneOpen: false,
  inFlightAnchors: [],
  saveCycleId: createSaveCycleId(),
  lastAiReviewRequest: null,
  availability: normalizeAvailability(),
  runtime: createRuntimeState()
})

const state = createDefaultFlowriteState()

const getters = {}

const setMarginThreadFocus = (state, threadId = null) => {
  state.activeMarginThreadId = threadId || null
  state.highlightedMarginThreadIds = threadId ? [threadId] : []
}

const mutations = {
  RESET_FLOWRITE_DOCUMENT (state, { availability } = {}) {
    state.pathname = ''
    state.bootstrapRequestId = 0
    state.document = null
    state.comments = []
    state.suggestions = []
    state.showAnnotationsPane = false
    setMarginThreadFocus(state, null)
    state.composerMarginThread = null
    state.composerMarginThreadWasAnnotationsPaneOpen = false
    state.inFlightAnchors = []
    state.saveCycleId = createSaveCycleId()
    state.lastAiReviewRequest = null
    state.availability = normalizeAvailability(availability)
    state.runtime = createRuntimeState()
  },

  APPLY_FLOWRITE_BOOTSTRAP (state, payload = {}) {
    const availability = normalizeAvailability(payload.availability)
    state.pathname = payload.pathname || ''
    state.document = payload.document && typeof payload.document === 'object'
      ? { ...payload.document }
      : null
    state.comments = cloneArray(payload.comments)
    state.suggestions = cloneArray(payload.suggestions)
    state.showAnnotationsPane = false
    setMarginThreadFocus(state, null)
    state.composerMarginThread = null
    state.composerMarginThreadWasAnnotationsPaneOpen = false
    state.inFlightAnchors = []
    state.saveCycleId = createSaveCycleId()
    state.lastAiReviewRequest = null
    state.availability = availability
    state.runtime = createRuntimeState({
      ready: typeof payload.runtimeReady === 'boolean' ? payload.runtimeReady : Boolean(availability.enabled)
    })
  },

  SET_FLOWRITE_BOOTSTRAP_REQUEST (state, payload = {}) {
    state.bootstrapRequestId = payload.requestId || 0
  },

  SET_FLOWRITE_RUNTIME_PROGRESS (state, payload = {}) {
    state.runtime = {
      ...state.runtime,
      ...(Object.prototype.hasOwnProperty.call(payload, 'ready') ? { ready: Boolean(payload.ready) } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'requestId') ? { requestId: payload.requestId || null } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'status') ? { status: payload.status || RUNTIME_STATUS_IDLE } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'phase') ? { phase: payload.phase || PHASE_IDLE } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'message') ? { message: payload.message || '' } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'error') ? { error: payload.error || null } : {})
    }
  },

  SET_FLOWRITE_IN_FLIGHT_ANCHORS (state, anchors) {
    state.inFlightAnchors = cloneArray(anchors)
  },

  SET_FLOWRITE_LAST_AI_REVIEW_REQUEST (state, payload = null) {
    state.lastAiReviewRequest = payload && typeof payload === 'object'
      ? { ...payload }
      : null
  },

  SET_FLOWRITE_MARGIN_THREAD_FOCUS (state, threadId) {
    setMarginThreadFocus(state, threadId)
  },

  SET_FLOWRITE_MARGIN_COMPOSER (state, composerMarginThread) {
    if (!composerMarginThread) {
      setMarginThreadFocus(state, null)
      state.composerMarginThread = null
      return
    }

    setMarginThreadFocus(state, composerMarginThread.id || null)
    state.composerMarginThread = {
      ...composerMarginThread,
      anchor: composerMarginThread.anchor ? { ...composerMarginThread.anchor } : null
    }
  },

  SET_FLOWRITE_MARGIN_COMPOSER_CONTEXT (state, payload = {}) {
    state.composerMarginThreadWasAnnotationsPaneOpen = Boolean(payload.annotationsPaneWasOpen)
  },

  APPLY_FLOWRITE_THREAD_REFRESH (state, payload = {}) {
    if (payload.document && typeof payload.document === 'object') {
      state.document = state.document
        ? { ...state.document, ...payload.document }
        : { ...payload.document }
    }

    if (Array.isArray(payload.comments)) {
      state.comments = payload.comments.slice()
    }

    if (Array.isArray(payload.suggestions)) {
      state.suggestions = payload.suggestions.slice()
    }
  },

  SET_FLOWRITE_BOOTSTRAP_FAILURE (state, payload = {}) {
    state.pathname = payload.pathname || ''
    state.document = null
    state.comments = []
    state.suggestions = []
    state.showAnnotationsPane = false
    setMarginThreadFocus(state, null)
    state.composerMarginThread = null
    state.composerMarginThreadWasAnnotationsPaneOpen = false
    state.inFlightAnchors = []
    state.saveCycleId = createSaveCycleId()
    state.lastAiReviewRequest = null
    state.availability = normalizeAvailability(payload.availability)
    state.runtime = {
      ...createRuntimeState(),
      status: RUNTIME_STATUS_FAILED,
      phase: PHASE_BOOTSTRAP,
      error: normalizeError(payload.error)
    }
  },

  ROTATE_FLOWRITE_SAVE_CYCLE (state) {
    state.saveCycleId = createSaveCycleId()
  },

  SET_FLOWRITE_ANNOTATIONS_PANE (state, isOpen) {
    state.showAnnotationsPane = Boolean(isOpen)
  }
}

const actions = {
  async BOOTSTRAP_FLOWRITE_DOCUMENT ({ commit, rootState, state }, pathname) {
    const requestedPathname = typeof pathname === 'string'
      ? pathname
      : (rootState.editor && rootState.editor.currentFile ? rootState.editor.currentFile.pathname : '')
    const preferenceAvailability = rootState.preferences ? rootState.preferences.flowrite : undefined

    if (!requestedPathname) {
      commit('RESET_FLOWRITE_DOCUMENT', {
        availability: preferenceAvailability
      })
      return null
    }

    const requestId = state.bootstrapRequestId + 1
    commit('SET_FLOWRITE_BOOTSTRAP_REQUEST', {
      requestId
    })

    let payload = null
    try {
      payload = await ipcRenderer.invoke('mt::flowrite:bootstrap-document', {
        pathname: requestedPathname
      })
    } catch (error) {
      const currentPathname = rootState.editor && rootState.editor.currentFile
        ? rootState.editor.currentFile.pathname
        : ''
      if (currentPathname === requestedPathname && state.bootstrapRequestId === requestId) {
        commit('SET_FLOWRITE_BOOTSTRAP_FAILURE', {
          pathname: requestedPathname,
          availability: preferenceAvailability,
          error
        })
      }
      return null
    }

    const currentPathname = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile.pathname
      : ''
    if (currentPathname !== requestedPathname || state.bootstrapRequestId !== requestId) {
      return payload
    }

    const availability = payload && payload.availability ? payload.availability : preferenceAvailability
    commit('APPLY_FLOWRITE_BOOTSTRAP', {
      pathname: requestedPathname,
      document: payload ? payload.document : null,
      comments: payload ? payload.comments : [],
      suggestions: payload ? payload.suggestions : [],
      availability,
      runtimeReady: payload && Object.prototype.hasOwnProperty.call(payload, 'runtimeReady')
        ? payload.runtimeReady
        : Boolean(availability && availability.enabled)
    })

    return payload
  },

  UPDATE_FLOWRITE_RUNTIME_PROGRESS ({ commit, state, dispatch }, payload = {}) {
    commit('SET_FLOWRITE_RUNTIME_PROGRESS', payload)

    if (Object.prototype.hasOwnProperty.call(payload, 'inFlightAnchors')) {
      commit('SET_FLOWRITE_IN_FLIGHT_ANCHORS', payload.inFlightAnchors)
      return
    }

    if (TERMINAL_RUNTIME_STATUSES.has(payload.status)) {
      commit('SET_FLOWRITE_IN_FLIGHT_ANCHORS', [])
    }

    if (
      payload.phase === PHASE_AI_REVIEW &&
      payload.status === RUNTIME_STATUS_COMPLETED &&
      state.comments.some(thread => thread && thread.scope === SCOPE_MARGIN)
    ) {
      commit('SET_FLOWRITE_ANNOTATIONS_PANE', true)
    }

    if (
      payload.phase === PHASE_AI_REVIEW &&
      payload.status === RUNTIME_STATUS_FAILED &&
      state.lastAiReviewRequest
    ) {
      const normalizedError = normalizeError(payload.error)
      const errorMessage = normalizedError
        ? normalizedError.message
        : 'Flowrite AI Review failed.'

      notice.notify({
        time: 0,
        title: 'Flowrite AI Review failed',
        message: `${errorMessage} Retry the same review?`,
        type: 'error',
        showConfirm: true
      }).then(() => {
        return dispatch('RUN_AI_REVIEW', state.lastAiReviewRequest)
      }).catch(() => {})
    }
  },

  APPLY_FLOWRITE_THREAD_REFRESH ({ commit, rootState }, payload = {}) {
    if (shouldIgnoreThreadRefresh(rootState, payload.pathname || '')) {
      return null
    }

    commit('APPLY_FLOWRITE_THREAD_REFRESH', payload)

    if (Object.prototype.hasOwnProperty.call(payload, 'inFlightAnchors')) {
      commit('SET_FLOWRITE_IN_FLIGHT_ANCHORS', payload.inFlightAnchors)
    }
  },

  async SUBMIT_GLOBAL_COMMENT ({ rootState }, body) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''
    const trimmedBody = typeof body === 'string' ? body.trim() : ''

    if (!pathname) {
      throw new Error('Save this document before starting a Flowrite discussion.')
    }

    if (!trimmedBody) {
      return null
    }

    return ipcRenderer.invoke('mt::flowrite:submit-global-comment', {
      pathname,
      markdown: typeof currentFile.markdown === 'string' ? currentFile.markdown : '',
      body: trimmedBody
    })
  },

  async SUBMIT_MARGIN_COMMENT ({ commit, rootState }, { body, anchor, threadId } = {}) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''
    const trimmedBody = typeof body === 'string' ? body.trim() : ''

    if (!pathname) {
      throw new Error('Save this document before leaving a Flowrite margin comment.')
    }

    if (!trimmedBody) {
      return null
    }

    const result = await ipcRenderer.invoke('mt::flowrite:submit-margin-comment', {
      pathname,
      markdown: typeof currentFile.markdown === 'string' ? currentFile.markdown : '',
      body: trimmedBody,
      anchor,
      threadId
    })
    commit('SET_FLOWRITE_ANNOTATIONS_PANE', true)
    return result
  },

  REPLY_TO_MARGIN_THREAD ({ dispatch }, { threadId, body, anchor } = {}) {
    return dispatch('SUBMIT_MARGIN_COMMENT', {
      threadId,
      body,
      anchor
    })
  },

  async DELETE_FLOWRITE_THREAD ({ rootState, dispatch }, { threadId } = {}) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''

    if (!pathname) {
      throw new Error('Save this document before deleting a Flowrite thread.')
    }

    const result = await ipcRenderer.invoke('mt::flowrite:delete-thread', {
      pathname,
      threadId,
      scope: SCOPE_MARGIN
    })

    const resultPathname = result && typeof result.pathname === 'string' && result.pathname
      ? result.pathname
      : pathname
    const currentPathname = getCurrentEditorPathname(rootState)

    if (resultPathname && currentPathname !== resultPathname) {
      return result
    }

    dispatch('APPLY_FLOWRITE_THREAD_REFRESH', {
      pathname: resultPathname,
      comments: result ? result.comments : [],
      suggestions: result ? result.suggestions : []
    })

    return result
  },

  async RUN_AI_REVIEW ({ commit, rootState }, payload = {}) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''
    const reviewPersona = typeof payload === 'string'
      ? payload
      : (payload.reviewPersona || 'friendly')
    const prompt = typeof payload === 'string'
      ? ''
      : (payload.prompt || '')
    const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : ''

    if (!pathname) {
      throw new Error('Save this document before running Flowrite AI Review.')
    }

    const reviewRequest = {
      reviewPersona,
      prompt: trimmedPrompt
    }
    commit('SET_FLOWRITE_LAST_AI_REVIEW_REQUEST', reviewRequest)

    return ipcRenderer.invoke('mt::flowrite:run-ai-review', {
      pathname,
      markdown: typeof currentFile.markdown === 'string' ? currentFile.markdown : '',
      reviewPersona,
      prompt: trimmedPrompt
    })
  },

  async REQUEST_SUGGESTION ({ commit, rootState }, { body, anchor } = {}) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''
    const trimmedBody = typeof body === 'string' ? body.trim() : ''

    if (!pathname) {
      throw new Error('Save this document before requesting a rewrite suggestion.')
    }

    if (!trimmedBody) {
      return null
    }

    const result = await ipcRenderer.invoke('mt::flowrite:request-suggestion', {
      pathname,
      markdown: typeof currentFile.markdown === 'string' ? currentFile.markdown : '',
      body: trimmedBody,
      anchor
    })
    commit('SET_FLOWRITE_ANNOTATIONS_PANE', true)
    return result
  },

  async ACCEPT_SUGGESTION ({ commit, rootState, state, dispatch }, suggestionId) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''
    const markdown = typeof currentFile.markdown === 'string' ? currentFile.markdown : ''

    if (!pathname) {
      throw new Error('Save this document before accepting a suggestion.')
    }

    const result = await ipcRenderer.invoke('mt::flowrite:accept-suggestion', {
      pathname,
      markdown,
      suggestionId,
      saveCycleId: state.saveCycleId
    })
    const replacement = result && result.replacement ? result.replacement : null

    if (replacement) {
      const nextMarkdown = `${markdown.slice(0, replacement.start)}${replacement.text}${markdown.slice(replacement.end)}`
      commit('SET_MARKDOWN', nextMarkdown, { root: true })
      commit('SET_SAVE_STATUS', false, { root: true })
      bus.$emit('file-changed', {
        id: currentFile.id,
        markdown: nextMarkdown,
        cursor: currentFile.cursor,
        renderCursor: false
      })
    }

    dispatch('APPLY_FLOWRITE_THREAD_REFRESH', {
      pathname,
      suggestions: result ? result.suggestions : []
    })

    return result
  },

  async REJECT_SUGGESTION ({ rootState, dispatch }, suggestionId) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''

    if (!pathname) {
      throw new Error('Save this document before rejecting a suggestion.')
    }

    const suggestions = await ipcRenderer.invoke('mt::flowrite:reject-suggestion', {
      pathname,
      suggestionId
    })
    dispatch('APPLY_FLOWRITE_THREAD_REFRESH', {
      pathname,
      suggestions
    })
    return suggestions
  },

  async FINALIZE_ACCEPTED_SUGGESTIONS_AFTER_SAVE ({ commit, rootState, dispatch }) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''

    if (!pathname) {
      return []
    }

    const suggestions = await ipcRenderer.invoke('mt::flowrite:finalize-suggestions-after-save', {
      pathname,
      markdown: typeof currentFile.markdown === 'string' ? currentFile.markdown : ''
    })
    dispatch('APPLY_FLOWRITE_THREAD_REFRESH', {
      pathname,
      suggestions
    })
    commit('ROTATE_FLOWRITE_SAVE_CYCLE')
    return suggestions
  },

  async LIST_FLOWRITE_VERSION_HISTORY ({ rootState }) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''

    if (!pathname) {
      return []
    }

    return ipcRenderer.invoke('mt::flowrite:list-version-history', {
      pathname
    })
  },

  async LOAD_FLOWRITE_VERSION_SNAPSHOT ({ rootState }, snapshotId) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const pathname = currentFile.pathname || ''

    if (!pathname || !snapshotId) {
      return null
    }

    return ipcRenderer.invoke('mt::flowrite:load-version-snapshot', {
      pathname,
      snapshotId
    })
  },

  async RESTORE_FLOWRITE_VERSION_SNAPSHOT ({ commit, rootState }, snapshot = {}) {
    const currentFile = rootState.editor && rootState.editor.currentFile
      ? rootState.editor.currentFile
      : {}
    const nextMarkdown = typeof snapshot.markdown === 'string' ? snapshot.markdown : ''

    if (!currentFile.id) {
      throw new Error('Open a document before restoring a version.')
    }

    if (!currentFile.isSaved) {
      throw new Error('Save or discard your current edits before restoring a version.')
    }

    commit('SET_MARKDOWN', nextMarkdown, { root: true })
    commit('SET_SAVE_STATUS', false, { root: true })
    bus.$emit('file-changed', {
      id: currentFile.id,
      markdown: nextMarkdown,
      cursor: currentFile.cursor,
      renderCursor: false
    })

    return nextMarkdown
  },

  TOGGLE_FLOWRITE_ANNOTATIONS_PANE ({ commit, state }) {
    const nextIsOpen = !state.showAnnotationsPane
    if (!nextIsOpen) {
      commit('SET_FLOWRITE_MARGIN_COMPOSER', null)
      commit('SET_FLOWRITE_MARGIN_THREAD_FOCUS', null)
      commit('SET_FLOWRITE_MARGIN_COMPOSER_CONTEXT', {
        annotationsPaneWasOpen: false
      })
    }
    commit('SET_FLOWRITE_ANNOTATIONS_PANE', nextIsOpen)
  },

  ACTIVATE_MARGIN_THREAD ({ commit, dispatch, state }, threadId) {
    if (!threadId) {
      commit('SET_FLOWRITE_MARGIN_THREAD_FOCUS', null)
      return null
    }

    commit('SET_FLOWRITE_MARGIN_THREAD_FOCUS', threadId)

    if (!state.showAnnotationsPane) {
      dispatch('OPEN_FLOWRITE_ANNOTATIONS_PANE')
    }

    return threadId
  },

  OPEN_FLOWRITE_MARGIN_COMPOSER ({ commit, dispatch, state }, selectionPayload = {}) {
    const anchor = createMarginAnchor({
      start: selectionPayload.start,
      end: selectionPayload.end,
      quote: selectionPayload.quote,
      startBlockText: selectionPayload.start ? selectionPayload.start.blockText : '',
      endBlockText: selectionPayload.end ? selectionPayload.end.blockText : ''
    })

    if (!anchor) {
      return null
    }

    const now = new Date().toISOString()
    const composerMarginThread = {
      id: 'flowrite-margin-thread-composer',
      scope: SCOPE_MARGIN,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      anchor,
      comments: []
    }

    if (!state.composerMarginThread) {
      commit('SET_FLOWRITE_MARGIN_COMPOSER_CONTEXT', {
        annotationsPaneWasOpen: Boolean(state.showAnnotationsPane)
      })
    }
    commit('SET_FLOWRITE_MARGIN_COMPOSER', composerMarginThread)

    if (!state.showAnnotationsPane) {
      dispatch('OPEN_FLOWRITE_ANNOTATIONS_PANE')
    }

    return composerMarginThread
  },

  CLOSE_FLOWRITE_MARGIN_COMPOSER ({ commit, state }, { restoreAnnotationsPane = true } = {}) {
    if (restoreAnnotationsPane && !state.composerMarginThreadWasAnnotationsPaneOpen) {
      commit('SET_FLOWRITE_ANNOTATIONS_PANE', false)
    }

    commit('SET_FLOWRITE_MARGIN_COMPOSER', null)
    commit('SET_FLOWRITE_MARGIN_COMPOSER_CONTEXT', {
      annotationsPaneWasOpen: false
    })
  },

  OPEN_FLOWRITE_ANNOTATIONS_PANE ({ commit }) {
    commit('SET_FLOWRITE_ANNOTATIONS_PANE', true)
  },

  CLOSE_FLOWRITE_ANNOTATIONS_PANE ({ commit }) {
    commit('SET_FLOWRITE_MARGIN_COMPOSER', null)
    commit('SET_FLOWRITE_MARGIN_THREAD_FOCUS', null)
    commit('SET_FLOWRITE_MARGIN_COMPOSER_CONTEXT', {
      annotationsPaneWasOpen: false
    })
    commit('SET_FLOWRITE_ANNOTATIONS_PANE', false)
  },

  LISTEN_FOR_FLOWRITE_RUNTIME ({ dispatch }) {
    ipcRenderer.on('mt::flowrite:runtime-progress', (event, payload = {}) => {
      dispatch('UPDATE_FLOWRITE_RUNTIME_PROGRESS', payload)
    })

    ipcRenderer.on('mt::flowrite:tool-state-updated', (event, payload = {}) => {
      dispatch('APPLY_FLOWRITE_THREAD_REFRESH', payload)
    })

    ipcRenderer.on('mt::tab-saved', () => {
      dispatch('FINALIZE_ACCEPTED_SUGGESTIONS_AFTER_SAVE').catch(() => {})
    })

    ipcRenderer.on('mt::set-pathname', () => {
      dispatch('FINALIZE_ACCEPTED_SUGGESTIONS_AFTER_SAVE').catch(() => {})
    })
  }
}

export const registerFlowriteLifecycle = store => {
  const unwatchPath = store.watch(
    state => (state.editor && state.editor.currentFile ? state.editor.currentFile.pathname || '' : ''),
    pathname => {
      store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', pathname).catch(() => {})
    }
  )

  const unwatchAvailability = store.watch(
    state => (state.preferences ? state.preferences.flowrite : null),
    availability => {
      const pathname = store.state.editor && store.state.editor.currentFile
        ? store.state.editor.currentFile.pathname || ''
        : ''

      if (!pathname) {
        store.commit('RESET_FLOWRITE_DOCUMENT', {
          availability
        })
        return
      }

      store.dispatch('BOOTSTRAP_FLOWRITE_DOCUMENT', pathname).catch(() => {})
    },
    { deep: true }
  )

  return () => {
    unwatchPath()
    unwatchAvailability()
  }
}

const flowrite = {
  state,
  getters,
  mutations,
  actions
}

export default flowrite

import fs from 'fs'
import { FlowriteRuntimeManager } from './ai/runtimeManager'
import { loadDocumentRecord } from './files/documentStore'
import {
  FLOWRITE_GLOBAL_THREAD_ID,
  appendCommentToThread,
  deleteThreadFromComments,
  loadComments
} from './files/commentsStore'
import { loadSuggestions, saveSuggestions } from './files/suggestionsStore'
import { ensureSnapshotForAcceptedSuggestion } from './files/snapshotStore'
import { markdownContainsSuggestionText, resolveSuggestionTarget } from '../../flowrite/suggestions'
import {
  SCOPE_GLOBAL,
  SCOPE_MARGIN,
  AUTHOR_USER,
  AUTHOR_ASSISTANT,
  SUGGESTION_STATUS_PENDING,
  SUGGESTION_STATUS_APPLIED_IN_BUFFER,
  SUGGESTION_STATUS_ACCEPTED,
  SUGGESTION_STATUS_REJECTED,
  RUNTIME_STATUS_RUNNING,
  RUNTIME_STATUS_COMPLETED,
  RUNTIME_STATUS_FAILED,
  PHASE_GLOBAL_COMMENT,
  PHASE_MARGIN_COMMENT,
  PHASE_AI_REVIEW,
  PHASE_SUGGESTION_REQUEST,
  JOB_TYPE_THREAD_REPLY,
  JOB_TYPE_AI_REVIEW,
  JOB_TYPE_REQUEST_SUGGESTION,
  PERSONA_FRIENDLY,
  FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY,
  FLOWRITE_THREAD_MODE_COMMENTING
} from '../../flowrite/constants'
import { resolveNextThreadMode } from './ai/collaborationRouting.js'
import { applyCommentGuardrails } from './ai/commentGuardrails.js'

const FLOWRITE_TEST_CLIENT_MODULE = process.env.FLOWRITE_TEST_CLIENT_MODULE || ''

const isWindowAlive = browserWindow => {
  return browserWindow && !browserWindow.isDestroyed() && browserWindow.webContents && !browserWindow.webContents.isDestroyed()
}

const createSuggestionId = () => `suggestion_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`

export class FlowriteController {
  constructor ({ flowriteSettings } = {}) {
    this.flowriteSettings = flowriteSettings
    this.runtimeManager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientConfig: this.getClientConfig(),
        clientModulePath: FLOWRITE_TEST_CLIENT_MODULE || undefined
      },
      executeToolCall: payload => this.executeToolCall(payload)
    })
  }

  getClientConfig () {
    return this.flowriteSettings && typeof this.flowriteSettings.getRuntimeConfig === 'function'
      ? this.flowriteSettings.getRuntimeConfig()
      : {}
  }

  getCollaborationMode () {
    const publicState = this.flowriteSettings && typeof this.flowriteSettings.getPublicState === 'function'
      ? this.flowriteSettings.getPublicState()
      : null

    return publicState && typeof publicState.collaborationMode === 'string'
      ? publicState.collaborationMode
      : FLOWRITE_COLLABORATION_MODE_COMMENT_ONLY
  }

  async getThreadContext (pathname, {
    threadId = null,
    scope = SCOPE_GLOBAL
  } = {}) {
    const comments = await loadComments(pathname)
    const resolvedThreadId = threadId || (scope === SCOPE_MARGIN ? null : FLOWRITE_GLOBAL_THREAD_ID)
    const thread = comments.find(candidate => (
      resolvedThreadId ? candidate.id === resolvedThreadId : false
    )) || null

    return {
      thread,
      currentThreadMode: thread && thread.interactionMode
        ? thread.interactionMode
        : FLOWRITE_THREAD_MODE_COMMENTING
    }
  }

  sendRuntimeProgress (browserWindow, payload = {}) {
    if (isWindowAlive(browserWindow)) {
      browserWindow.webContents.send('mt::flowrite:runtime-progress', payload)
    }
  }

  async sendPersistedRefresh (browserWindow, pathname) {
    if (!pathname || !isWindowAlive(browserWindow)) {
      return
    }

    const [document, comments, suggestions] = await Promise.all([
      loadDocumentRecord(pathname),
      loadComments(pathname),
      loadSuggestions(pathname)
    ])

    browserWindow.webContents.send('mt::flowrite:tool-state-updated', {
      pathname,
      document,
      comments,
      suggestions
    })
  }

  async executeToolCall ({ name, input = {}, documentPath, jobType = null }) {
    if (name === 'create_comment') {
      const { currentThreadMode } = await this.getThreadContext(documentPath, {
        threadId: input.threadId,
        scope: input.scope
      })
      const guardedComment = applyCommentGuardrails({
        body: input.body,
        threadMode: jobType === JOB_TYPE_AI_REVIEW
          ? FLOWRITE_THREAD_MODE_COMMENTING
          : currentThreadMode
      })

      if (guardedComment.rejected) {
        throw new Error(guardedComment.reason)
      }

      const { thread, comment } = await appendCommentToThread(documentPath, {
        threadId: input.threadId,
        scope: input.scope,
        anchor: input.anchor,
        author: AUTHOR_ASSISTANT,
        body: guardedComment.body
      })

      return {
        ok: true,
        threadId: thread.id,
        commentId: comment.id
      }
    }

    if (name === 'propose_suggestion') {
      const suggestions = await loadSuggestions(documentPath)
      const suggestion = {
        id: input.id || createSuggestionId(),
        threadId: input.threadId || FLOWRITE_GLOBAL_THREAD_ID,
        targetText: input.targetText,
        suggestedText: input.suggestedText,
        rationale: input.rationale || '',
        anchor: input.anchor || null,
        status: SUGGESTION_STATUS_PENDING,
        author: AUTHOR_ASSISTANT,
        createdAt: new Date().toISOString(),
        bufferAppliedAt: null,
        acceptedAt: null,
        rejectedAt: null,
        appliedSaveCycleId: null
      }
      suggestions.push(suggestion)
      await saveSuggestions(documentPath, suggestions)

      return {
        ok: true,
        suggestionId: suggestion.id
      }
    }

    throw new Error(`Unsupported Flowrite tool: ${name}`)
  }

  async _runWithProgress ({ browserWindow, pathname, phase, runningMessage, jobConfig, beforeJob, onProgress }) {
    const availability = this.flowriteSettings.getPublicState()
    if (!availability.enabled) {
      const error = new Error('Flowrite is unavailable for this document right now.')
      error.code = availability.reason || 'FLOWRITE_UNAVAILABLE'
      throw error
    }

    this.runtimeManager.runtimeConfig.clientConfig = this.getClientConfig()

    if (typeof beforeJob === 'function') {
      await beforeJob()
    }

    const resolvedJobConfig = typeof jobConfig === 'function' ? jobConfig() : jobConfig

    this.sendRuntimeProgress(browserWindow, {
      ready: true,
      status: RUNTIME_STATUS_RUNNING,
      phase,
      message: runningMessage,
      error: null
    })

    try {
      const result = await this.runtimeManager.runJob({
        ...resolvedJobConfig,
        ...(onProgress ? { onProgress } : {})
      })

      this.sendRuntimeProgress(browserWindow, {
        ready: true,
        requestId: result.requestId,
        status: RUNTIME_STATUS_COMPLETED,
        phase,
        message: '',
        error: null
      })

      return result
    } catch (error) {
      this.sendRuntimeProgress(browserWindow, {
        ready: true,
        status: RUNTIME_STATUS_FAILED,
        phase,
        message: '',
        error: {
          code: error.code || null,
          message: error.message || String(error)
        }
      })
      throw error
    } finally {
      await this.sendPersistedRefresh(browserWindow, pathname)
    }
  }

  buildGlobalCommentPrompt (body) {
    return [
      'The writer added a new global comment in the bottom discussion area.',
      `Writer comment: ${body}`,
      `Reply in the existing global discussion thread using threadId "${FLOWRITE_GLOBAL_THREAD_ID}".`,
      'Use create_comment with scope "global".',
      'Keep the reply concise, comment-native, and grounded in the document.'
    ].join('\n\n')
  }

  buildMarginCommentPrompt (body, anchor, threadId) {
    const quote = anchor && anchor.quote ? anchor.quote : ''
    const startKey = anchor && anchor.start ? anchor.start.key : ''
    const endKey = anchor && anchor.end ? anchor.end.key : ''
    const startOffset = anchor && anchor.start ? anchor.start.offset : 0
    const endOffset = anchor && anchor.end ? anchor.end.offset : 0

    return [
      'The writer added a new margin comment tied to a selection in the document body.',
      quote ? `Selected quote: "${quote}"` : 'Selected quote: unavailable',
      `Primary anchor: start ${startKey}:${startOffset}, end ${endKey}:${endOffset}.`,
      `Writer comment: ${body}`,
      `Reply in the existing margin thread using threadId "${threadId}".`,
      'Use create_comment with scope "margin".',
      'Keep the reply short, annotation-like, and grounded in the selected passage.'
    ].join('\n\n')
  }

  buildAiReviewPrompt (reviewPersona = PERSONA_FRIENDLY, prompt = '') {
    const personaLabel = reviewPersona || PERSONA_FRIENDLY
    const extraPrompt = typeof prompt === 'string' ? prompt.trim() : ''

    const instructions = [
      `Run a document-wide AI review using the "${personaLabel}" persona.`,
      'Leave 1 to 3 concise comments in the existing global discussion thread.',
      `Use create_comment with scope "global" and threadId "${FLOWRITE_GLOBAL_THREAD_ID}" for whole-draft observations.`,
      'You may also create passage-level comments when a sentence or paragraph deserves direct attention.',
      'For passage-level comments, use create_comment with scope "margin" and include an anchor object with quote, start, and end details when possible.',
      'Each comment should focus on one distinct issue, question, or spark in the draft.',
      'Do not propose rewrites in this pass unless explicitly asked later.',
      'Do not write free-text output as the review result. Persist feedback only through comment tools.'
    ]

    if (extraPrompt) {
      instructions.splice(1, 0, `Specific review request: ${extraPrompt}`)
    }

    return instructions.join('\n\n')
  }

  buildSuggestionPrompt (body, anchor, threadId) {
    const quote = anchor && anchor.quote ? anchor.quote : ''

    return [
      'The writer explicitly asked for rewrite help on a selected passage.',
      quote ? `Selected quote: "${quote}"` : 'Selected quote: unavailable',
      `Writer request: ${body}`,
      `Persist one rewrite suggestion with threadId "${threadId}".`,
      'Use propose_suggestion with the selected quote as targetText, your revised text as suggestedText, and a short rationale.',
      'Do not create comments in this job.'
    ].join('\n\n')
  }

  async submitGlobalComment ({ browserWindow, pathname, markdown = '', body = '' } = {}) {
    const trimmedBody = typeof body === 'string' ? body.trim() : ''
    if (!pathname) {
      throw new Error('Flowrite global comments require a saved markdown file.')
    }
    if (!trimmedBody) {
      throw new Error('Flowrite global comments require a message.')
    }

    const collaborationMode = this.getCollaborationMode()
    let currentThreadMode = FLOWRITE_THREAD_MODE_COMMENTING

    return this._runWithProgress({
      browserWindow,
      pathname,
      phase: PHASE_GLOBAL_COMMENT,
      runningMessage: 'Flowrite is replying...',
      beforeJob: async () => {
        const threadContext = await this.getThreadContext(pathname, {
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          scope: SCOPE_GLOBAL
        })
        currentThreadMode = threadContext.currentThreadMode
        const nextThreadMode = resolveNextThreadMode({
          collaborationMode,
          currentThreadMode,
          latestUserMessage: trimmedBody
        })

        await appendCommentToThread(pathname, {
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          scope: SCOPE_GLOBAL,
          author: AUTHOR_USER,
          body: trimmedBody,
          interactionMode: nextThreadMode
        })
        await this.sendPersistedRefresh(browserWindow, pathname)
      },
      jobConfig: () => ({
        jobType: JOB_TYPE_THREAD_REPLY,
        documentPath: pathname,
        payload: {
          markdown,
          prompt: this.buildGlobalCommentPrompt(trimmedBody),
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          collaborationMode,
          currentThreadMode,
          latestUserMessage: trimmedBody
        }
      })
    })
  }

  async submitMarginComment ({ browserWindow, pathname, markdown = '', body = '', anchor = null, threadId = null } = {}) {
    const trimmedBody = typeof body === 'string' ? body.trim() : ''
    if (!pathname) {
      throw new Error('Flowrite margin comments require a saved markdown file.')
    }
    if (!trimmedBody) {
      throw new Error('Flowrite margin comments require a message.')
    }

    const collaborationMode = this.getCollaborationMode()
    let thread
    let currentThreadMode = FLOWRITE_THREAD_MODE_COMMENTING
    return this._runWithProgress({
      browserWindow,
      pathname,
      phase: PHASE_MARGIN_COMMENT,
      runningMessage: 'Flowrite is replying in the margin...',
      beforeJob: async () => {
        const threadContext = await this.getThreadContext(pathname, {
          threadId,
          scope: SCOPE_MARGIN
        })
        if (threadId && !threadContext.thread) {
          throw new Error('This Flowrite margin thread no longer exists.')
        }

        const replyAnchor = threadContext.thread && threadContext.thread.anchor
          ? threadContext.thread.anchor
          : anchor

        if (!replyAnchor || !replyAnchor.quote || !replyAnchor.start || !replyAnchor.end) {
          throw new Error('Flowrite margin comments require a valid text selection anchor.')
        }

        currentThreadMode = threadContext.currentThreadMode
        const nextThreadMode = resolveNextThreadMode({
          collaborationMode,
          currentThreadMode,
          latestUserMessage: trimmedBody
        })

        const result = await appendCommentToThread(pathname, {
          scope: SCOPE_MARGIN,
          threadId,
          anchor: replyAnchor,
          author: AUTHOR_USER,
          body: trimmedBody,
          interactionMode: nextThreadMode
        })
        thread = result.thread
        await this.sendPersistedRefresh(browserWindow, pathname)
      },
      jobConfig: () => ({
        jobType: JOB_TYPE_THREAD_REPLY,
        documentPath: pathname,
        payload: {
          markdown,
          prompt: this.buildMarginCommentPrompt(trimmedBody, thread.anchor, thread.id),
          threadId: thread.id,
          collaborationMode,
          currentThreadMode,
          latestUserMessage: trimmedBody
        }
      })
    })
  }

  async deleteThread ({ browserWindow, pathname, threadId } = {}) {
    if (!pathname) {
      throw new Error('Flowrite thread deletion requires a saved markdown file.')
    }

    if (threadId === FLOWRITE_GLOBAL_THREAD_ID) {
      throw new Error('Flowrite global thread cannot be deleted.')
    }

    const result = await deleteThreadFromComments(pathname, {
      threadId,
      scope: SCOPE_MARGIN
    })

    await this.sendPersistedRefresh(browserWindow, pathname)
    return result
  }

  async runAiReview ({ browserWindow, pathname, markdown = '', reviewPersona = PERSONA_FRIENDLY, prompt = '' } = {}) {
    if (!pathname) {
      throw new Error('Flowrite AI Review requires a saved markdown file.')
    }

    let createdCommentCount = 0
    return this._runWithProgress({
      browserWindow,
      pathname,
      phase: PHASE_AI_REVIEW,
      runningMessage: 'Flowrite is reviewing the whole draft...',
      beforeJob: async () => {
        await this.sendPersistedRefresh(browserWindow, pathname)
      },
      jobConfig: {
        jobType: JOB_TYPE_AI_REVIEW,
        documentPath: pathname,
        payload: {
          markdown,
          prompt: this.buildAiReviewPrompt(reviewPersona, prompt),
          reviewPersona,
          threadId: FLOWRITE_GLOBAL_THREAD_ID
        }
      },
      onProgress: async event => {
        if (!event || event.eventType !== 'tool_result') {
          return
        }
        if (!event.payload || event.payload.name !== 'create_comment') {
          return
        }

        createdCommentCount += 1
        await this.sendPersistedRefresh(browserWindow, pathname)
        this.sendRuntimeProgress(browserWindow, {
          ready: true,
          requestId: event.requestId,
          status: RUNTIME_STATUS_RUNNING,
          phase: PHASE_AI_REVIEW,
          message: `Flowrite added ${createdCommentCount} review comment${createdCommentCount === 1 ? '' : 's'}...`,
          error: null
        })
      }
    })
  }

  async requestSuggestion ({ browserWindow, pathname, markdown = '', body = '', anchor = null } = {}) {
    const trimmedBody = typeof body === 'string' ? body.trim() : ''
    if (!pathname) {
      throw new Error('Flowrite rewrite suggestions require a saved markdown file.')
    }
    if (!trimmedBody) {
      throw new Error('Flowrite rewrite suggestions require a prompt.')
    }
    if (!anchor || !anchor.quote || !anchor.start || !anchor.end) {
      throw new Error('Flowrite rewrite suggestions require a valid text selection anchor.')
    }
    if (anchor.start.key !== anchor.end.key) {
      throw new Error('Flowrite rewrite suggestions currently support single-paragraph selections only.')
    }

    let thread
    return this._runWithProgress({
      browserWindow,
      pathname,
      phase: PHASE_SUGGESTION_REQUEST,
      runningMessage: 'Flowrite is drafting a rewrite suggestion...',
      beforeJob: async () => {
        const result = await appendCommentToThread(pathname, {
          scope: SCOPE_MARGIN,
          anchor,
          author: AUTHOR_USER,
          body: trimmedBody
        })
        thread = result.thread
        await this.sendPersistedRefresh(browserWindow, pathname)
      },
      jobConfig: () => ({
        jobType: JOB_TYPE_REQUEST_SUGGESTION,
        documentPath: pathname,
        payload: {
          markdown,
          prompt: this.buildSuggestionPrompt(trimmedBody, thread.anchor, thread.id),
          threadId: thread.id
        }
      })
    })
  }

  async acceptSuggestion ({ pathname, markdown = '', suggestionId, saveCycleId } = {}) {
    if (!pathname || !suggestionId || !saveCycleId) {
      throw new Error('Flowrite suggestion acceptance requires pathname, suggestionId, and saveCycleId.')
    }

    const suggestions = await loadSuggestions(pathname)
    const suggestion = suggestions.find(entry => entry.id === suggestionId)
    if (!suggestion) {
      throw new Error('Flowrite could not find this suggestion.')
    }
    if (suggestion.status === SUGGESTION_STATUS_REJECTED) {
      throw new Error('Rejected suggestions cannot be applied.')
    }

    const replacement = resolveSuggestionTarget(markdown, suggestion)
    if (!replacement) {
      const error = new Error('This suggestion is stale and can no longer be applied safely.')
      error.code = 'FLOWRITE_STALE_SUGGESTION'
      throw error
    }

    await ensureSnapshotForAcceptedSuggestion(pathname, markdown, {
      saveCycleId,
      suggestionId
    })

    const now = new Date().toISOString()
    const nextSuggestions = suggestions.map(entry => {
      if (entry.id !== suggestionId) {
        return entry
      }

      return {
        ...entry,
        anchor: replacement.anchor || entry.anchor,
        status: SUGGESTION_STATUS_APPLIED_IN_BUFFER,
        bufferAppliedAt: now,
        acceptedAt: null,
        rejectedAt: null,
        appliedSaveCycleId: saveCycleId
      }
    })

    await saveSuggestions(pathname, nextSuggestions)

    return {
      suggestionId,
      replacement: {
        start: replacement.start,
        end: replacement.end,
        text: suggestion.suggestedText
      },
      suggestions: nextSuggestions
    }
  }

  async rejectSuggestion ({ pathname, suggestionId } = {}) {
    if (!pathname || !suggestionId) {
      throw new Error('Flowrite suggestion rejection requires pathname and suggestionId.')
    }

    const now = new Date().toISOString()
    const suggestions = await loadSuggestions(pathname)
    const nextSuggestions = suggestions.map(entry => {
      if (entry.id !== suggestionId) {
        return entry
      }

      return {
        ...entry,
        status: SUGGESTION_STATUS_REJECTED,
        rejectedAt: now
      }
    })

    await saveSuggestions(pathname, nextSuggestions)
    return nextSuggestions
  }

  async finalizeAcceptedSuggestionsAfterSave ({ pathname, markdown = '' } = {}) {
    if (!pathname) {
      return []
    }

    const now = new Date().toISOString()
    const suggestions = await loadSuggestions(pathname)
    const nextSuggestions = suggestions.map(entry => {
      if (entry.status !== SUGGESTION_STATUS_APPLIED_IN_BUFFER) {
        return entry
      }

      if (!markdownContainsSuggestionText(markdown, entry)) {
        return {
          ...entry,
          status: SUGGESTION_STATUS_PENDING,
          bufferAppliedAt: null,
          acceptedAt: null,
          appliedSaveCycleId: null
        }
      }

      return {
        ...entry,
        status: SUGGESTION_STATUS_ACCEPTED,
        acceptedAt: now
      }
    })

    await saveSuggestions(pathname, nextSuggestions)
    return nextSuggestions
  }

  async reconcileSuggestionsWithMarkdown (pathname) {
    const suggestions = await loadSuggestions(pathname)
    let markdown = ''
    try {
      markdown = await fs.promises.readFile(pathname, 'utf8')
    } catch (_) {
      // File doesn't exist yet — treat as empty
    }

    const nextSuggestions = suggestions.map(entry => {
      if (entry.status !== SUGGESTION_STATUS_APPLIED_IN_BUFFER) {
        return entry
      }

      if (markdownContainsSuggestionText(markdown, entry)) {
        return {
          ...entry,
          status: SUGGESTION_STATUS_ACCEPTED,
          acceptedAt: entry.acceptedAt || new Date().toISOString()
        }
      }

      return {
        ...entry,
        status: SUGGESTION_STATUS_PENDING,
        bufferAppliedAt: null,
        acceptedAt: null,
        appliedSaveCycleId: null
      }
    })

    await saveSuggestions(pathname, nextSuggestions)
    return nextSuggestions
  }

  async dispose () {
    await this.runtimeManager.dispose()
  }
}

export default FlowriteController

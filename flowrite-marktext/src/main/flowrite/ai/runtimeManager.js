import log from 'electron-log'
import { buildHistoryPromptEntry, buildRuntimeRequest, trimConversationHistory } from './promptBuilder'
import { getAnthropicClientConfig } from './anthropicClient'
import { createRuntimeWorker } from './runtimeWorker'
import * as documentStore from '../files/documentStore'
import { normalizeFlowriteNetworkError } from '../network/status'

const createRequestId = () => {
  return `flowrite_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const createRuntimeError = payload => {
  const error = new Error(payload && payload.message ? payload.message : 'Flowrite AI runtime failed.')
  if (payload && payload.code) {
    error.code = payload.code
  }
  if (payload && payload.status) {
    error.status = payload.status
  }
  return error
}

const createRuntimeExitError = code => {
  const exitCode = typeof code === 'number' ? code : 0
  const error = new Error(exitCode === 0
    ? 'Flowrite AI runtime exited unexpectedly.'
    : `Flowrite AI runtime exited with code ${exitCode}.`)
  error.code = 'AI_RUNTIME_EXIT'
  return error
}

const createRuntimeDisposedError = () => {
  const error = new Error('Flowrite AI runtime was disposed before the request completed.')
  error.code = 'AI_RUNTIME_DISPOSED'
  return error
}

const normalizeRuntimeError = error => {
  return normalizeFlowriteNetworkError(error)
}

export class FlowriteRuntimeManager {
  constructor ({ runtimeConfig = {}, executeToolCall } = {}) {
    this.runtimeConfig = runtimeConfig
    this.documentStore = runtimeConfig.documentStore || documentStore
    this.executeToolCall = executeToolCall || (async () => {
      throw new Error('No Flowrite tool executor configured.')
    })
    this.pendingRequests = new Map()
    this.documentQueues = new Map()
    this.readyPromise = null
    this.disposed = false
    this.worker = null
  }

  async runJob ({ jobType, documentPath, payload, onProgress = null }) {
    const run = async () => {
      await this.ensureWorker()

      const documentRecord = await this.documentStore.loadDocumentRecord(documentPath)
      const historyState = trimConversationHistory(documentRecord.conversationHistory)
      const requestId = createRequestId()
      const clientConfig = getAnthropicClientConfig(this.runtimeConfig.clientConfig)

      if (!this.runtimeConfig.clientModulePath && !clientConfig.apiKey) {
        const error = new Error('AI unavailable. Missing AI gateway key.')
        error.code = 'AI_UNAVAILABLE'
        throw error
      }

      const request = buildRuntimeRequest({
        jobType,
        documentPath,
        markdown: payload.markdown || '',
        prompt: payload.prompt || '',
        conversationHistory: historyState.conversationHistory,
        reviewPersona: payload.reviewPersona || documentRecord.lastReviewPersona,
        collaborationMode: payload.collaborationMode,
        currentThreadMode: payload.currentThreadMode,
        latestUserMessage: payload.latestUserMessage,
        threadId: payload.threadId || null,
        model: clientConfig.model
      })

      const result = await new Promise((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject, onProgress, jobType })
        this.worker.postMessage({
          requestId,
          eventType: 'run_job',
          payload: {
            request,
            clientConfig
          }
        })
      }).catch(error => {
        throw normalizeRuntimeError(error)
      })

      const updatedHistory = trimConversationHistory([
        ...historyState.conversationHistory,
        buildHistoryPromptEntry(payload.prompt || ''),
        ...(result.conversationEntries || [])
      ])

      let historyPersistenceFailed = false
      try {
        await this.documentStore.saveDocumentRecord(documentPath, {
          ...documentRecord,
          conversationHistory: updatedHistory.conversationHistory,
          historyTokenEstimate: updatedHistory.historyTokenEstimate,
          lastReviewPersona: payload.reviewPersona || documentRecord.lastReviewPersona
        })
      } catch (error) {
        historyPersistenceFailed = true
        log.error(`Flowrite runtime history persistence failed for "${documentPath}".`, error)
      }

      return {
        requestId,
        finalText: result.finalText,
        historyTrimmed: historyState.trimmedCount > 0 || updatedHistory.trimmedCount > 0,
        historyTokenEstimate: updatedHistory.historyTokenEstimate,
        historyPersistenceFailed
      }
    }

    const queueKey = documentPath || '__global__'
    const previous = this.documentQueues.get(queueKey) || Promise.resolve()
    const queued = previous.catch(() => {}).then(run)
    const tracked = queued.finally(() => {
      if (this.documentQueues.get(queueKey) === tracked) {
        this.documentQueues.delete(queueKey)
      }
    })
    this.documentQueues.set(queueKey, tracked)
    return queued
  }

  async ensureWorker () {
    if (this.disposed) {
      throw new Error('Flowrite AI runtime manager is disposed.')
    }

    if (this.worker) {
      return this.readyPromise
    }

    this.worker = createRuntimeWorker(this.runtimeConfig)
    const activeWorker = this.worker
    this.readyPromise = new Promise((resolve, reject) => {
      let startupSettled = false

      const settleStartup = callback => {
        if (startupSettled) {
          return
        }
        startupSettled = true
        callback()
      }

      const handleReady = message => {
        if (message && message.eventType === 'ready') {
          settleStartup(() => resolve())
        }
      }

      const handleStartupError = error => {
        settleStartup(() => reject(error))
      }

      const handleStartupExit = code => {
        settleStartup(() => reject(createRuntimeExitError(code)))
      }

      const handleMessage = message => {
        handleReady(message)
        this.handleWorkerMessage(activeWorker, message)
      }

      const handleError = error => {
        handleStartupError(error)
        this.handleWorkerError(activeWorker, error)
      }

      const handleExit = code => {
        handleStartupExit(code)
        this.handleWorkerExit(activeWorker, code)
      }

      activeWorker.__flowriteRuntimeListeners = {
        message: handleMessage,
        error: handleError,
        exit: handleExit
      }

      activeWorker.on('message', handleMessage)
      activeWorker.on('error', handleError)
      activeWorker.on('exit', handleExit)
    })

    return this.readyPromise
  }

  detachWorker = (worker = this.worker) => {
    if (!worker) {
      return
    }

    const listeners = worker.__flowriteRuntimeListeners
    if (listeners) {
      worker.off('message', listeners.message)
      worker.off('error', listeners.error)
      worker.off('exit', listeners.exit)
      delete worker.__flowriteRuntimeListeners
    }

    if (this.worker === worker) {
      this.worker = null
      this.readyPromise = null
    }
  }

  rejectPendingRequests = error => {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  handleWorkerMessage = async (worker, message) => {
    if (this.worker !== worker) {
      return
    }

    if (!message || !message.eventType || !message.requestId) {
      return
    }

    const pending = this.pendingRequests.get(message.requestId)
    if (!pending) {
      return
    }

    if (message.eventType === 'completed') {
      this.pendingRequests.delete(message.requestId)
      pending.resolve(message.payload)
      return
    }

    if (message.eventType === 'failed') {
      this.pendingRequests.delete(message.requestId)
      pending.reject(createRuntimeError(message.payload))
      return
    }

    if (message.eventType === 'tool_call') {
      try {
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({
            eventType: 'tool_call',
            requestId: message.requestId,
            payload: message.payload
          })
        }

        const result = await this.executeToolCall({
          name: message.payload.name,
          input: message.payload.input,
          documentPath: message.payload.documentPath,
          requestId: message.requestId,
          jobType: pending.jobType
        })

        if (this.worker !== worker) {
          return
        }

        worker.postMessage({
          requestId: message.requestId,
          eventType: 'tool_result',
          payload: {
            toolUseId: message.payload.toolUseId,
            result
          }
        })

        if (typeof pending.onProgress === 'function') {
          pending.onProgress({
            eventType: 'tool_result',
            requestId: message.requestId,
            payload: {
              ...message.payload,
              result
            }
          })
        }
      } catch (error) {
        if (this.worker !== worker) {
          return
        }

        worker.postMessage({
          requestId: message.requestId,
          eventType: 'tool_error',
          payload: {
            toolUseId: message.payload.toolUseId,
            error: {
              message: error.message,
              code: error.code
            }
          }
        })
      }
    }
  }

  handleWorkerError = (worker, error) => {
    if (this.worker !== worker) {
      return
    }

    const normalizedError = normalizeRuntimeError(error)
    this.rejectPendingRequests(normalizedError)
    this.detachWorker(worker)
  }

  handleWorkerExit = (worker, code) => {
    if (this.worker !== worker) {
      return
    }

    const error = createRuntimeExitError(code)
    this.rejectPendingRequests(error)
    this.detachWorker(worker)
  }

  async dispose () {
    this.disposed = true
    this.rejectPendingRequests(createRuntimeDisposedError())
    if (this.worker) {
      const activeWorker = this.worker
      this.detachWorker(activeWorker)
      await activeWorker.terminate()
    }
  }
}

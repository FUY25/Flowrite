import { EventEmitter } from 'events'
import { createRequire as nodeCreateRequire } from 'module'
import { Worker } from 'worker_threads'
import { resolveNodeFetch } from './webApiPolyfills'

export const MAX_TOOL_ITERATIONS = 8

const createClientRuntime = (workerData, clientConfig) => {
  const runtimeRequire = (() => {
    // eslint-disable-next-line camelcase,no-undef
    if (typeof __non_webpack_require__ === 'function') {
      // eslint-disable-next-line camelcase,no-undef
      return __non_webpack_require__
    }
    return nodeCreateRequire(__filename)
  })()

  if (typeof workerData.createClientRuntime === 'function') {
    return workerData.createClientRuntime(clientConfig)
  }

  if (workerData.clientModulePath) {
    const clientModule = runtimeRequire(workerData.clientModulePath)
    if (clientModule && typeof clientModule.createAnthropicClient === 'function') {
      return clientModule.createAnthropicClient(clientConfig)
    }
  }

  const anthropicModule = runtimeRequire('@anthropic-ai/sdk')
  const Anthropic = anthropicModule.default || anthropicModule

  return {
    client: new Anthropic({
      apiKey: clientConfig.apiKey,
      baseURL: clientConfig.baseURL,
      defaultHeaders: clientConfig.defaultHeaders,
      fetch: resolveNodeFetch()
    }),
    model: clientConfig.model
  }
}

const serializeError = error => ({
  name: error && error.name ? error.name : 'Error',
  message: error && error.message ? error.message : String(error),
  code: error && error.code ? error.code : undefined,
  status: error && error.status ? error.status : undefined
})

const flattenText = content => {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

const buildToolResultBlock = (toolUseId, result) => ({
  type: 'tool_result',
  tool_use_id: toolUseId,
  content: typeof result === 'string' ? result : JSON.stringify(result)
})

const createJobRunner = (transport, workerData) => {
  const pendingToolResults = new Map()

  const waitForToolResult = (requestId, toolUseId) => {
    return new Promise((resolve, reject) => {
      pendingToolResults.set(`${requestId}:${toolUseId}`, { resolve, reject })
    })
  }

  const resolveToolResult = message => {
    const key = `${message.requestId}:${message.payload.toolUseId}`
    const pending = pendingToolResults.get(key)
    if (!pending) {
      return
    }

    pendingToolResults.delete(key)

    if (message.eventType === 'tool_error') {
      const error = new Error(message.payload.error && message.payload.error.message ? message.payload.error.message : 'Tool execution failed.')
      if (message.payload.error && message.payload.error.code) {
        error.code = message.payload.error.code
      }
      pending.reject(error)
      return
    }

    pending.resolve(message.payload.result)
  }

  const runJob = async message => {
    const { requestId, payload } = message
    const runtime = createClientRuntime(workerData, payload.clientConfig)
    const request = {
      ...payload.request,
      model: payload.request.model || runtime.model
    }

    const documentPath = request.metadata && request.metadata.documentPath
    const messages = request.messages.slice()
    const conversationEntries = []
    let toolCallCount = 0

    try {
      while (true) {
        const response = await runtime.client.messages.create({
          ...request,
          messages
        })

        const assistantMessage = {
          role: 'assistant',
          content: response.content || []
        }
        messages.push(assistantMessage)
        conversationEntries.push(assistantMessage)

        const toolUses = (response.content || []).filter(block => block && block.type === 'tool_use')
        if (!toolUses.length) {
          transport.emit('message', {
            requestId,
            eventType: 'completed',
            payload: {
              finalText: flattenText(response.content || []),
              conversationEntries
            }
          })
          return
        }

        toolCallCount += toolUses.length
        if (toolCallCount > MAX_TOOL_ITERATIONS) {
          const error = new Error(`Flowrite tool iteration limit exceeded (${MAX_TOOL_ITERATIONS}).`)
          error.code = 'AI_TOOL_LOOP_LIMIT'
          throw error
        }

        const toolResults = []
        for (const toolUse of toolUses) {
          transport.emit('message', {
            requestId,
            eventType: 'tool_call',
            payload: {
              documentPath,
              toolUseId: toolUse.id,
              name: toolUse.name,
              input: toolUse.input || {}
            }
          })

          const result = await waitForToolResult(requestId, toolUse.id)
          toolResults.push(buildToolResultBlock(toolUse.id, result))
        }

        const toolResultMessage = {
          role: 'user',
          content: toolResults
        }
        messages.push(toolResultMessage)
        conversationEntries.push(toolResultMessage)
      }
    } catch (error) {
      transport.emit('message', {
        requestId,
        eventType: 'failed',
        payload: serializeError(error)
      })
    }
  }

  return {
    resolveToolResult,
    runJob
  }
}

export const buildRuntimeWorkerSource = () => `
  const { parentPort, workerData } = require('worker_threads')
  const runtimeRequire = typeof __non_webpack_require__ === 'function'
    ? __non_webpack_require__
    : require

  const pendingToolResults = new Map()

  const serializeError = error => ({
    name: error && error.name ? error.name : 'Error',
    message: error && error.message ? error.message : String(error),
    code: error && error.code ? error.code : undefined,
    status: error && error.status ? error.status : undefined
  })

  const flattenText = content => {
    if (!Array.isArray(content)) {
      return ''
    }

    return content
      .filter(block => block && block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join('\\n')
  }

  const buildToolResultBlock = (toolUseId, result) => ({
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: typeof result === 'string' ? result : JSON.stringify(result)
  })

  const resolveWorkerFetch = () => {
    const hasAllRequiredApis = typeof globalThis.fetch === 'function' &&
      typeof globalThis.Headers === 'function' &&
      typeof globalThis.Request === 'function' &&
      typeof globalThis.Response === 'function' &&
      typeof globalThis.FormData === 'function'

    if (!hasAllRequiredApis) {
      const undiciModule = require('undici')
      const {
        fetch,
        Headers,
        Request,
        Response,
        FormData,
        File
      } = undiciModule

      if (typeof globalThis.fetch !== 'function') {
        globalThis.fetch = fetch
      }
      if (typeof globalThis.Headers !== 'function') {
        globalThis.Headers = Headers
      }
      if (typeof globalThis.Request !== 'function') {
        globalThis.Request = Request
      }
      if (typeof globalThis.Response !== 'function') {
        globalThis.Response = Response
      }
      if (typeof globalThis.FormData !== 'function') {
        globalThis.FormData = FormData
      }
      if (typeof globalThis.File !== 'function' && typeof File === 'function') {
        globalThis.File = File
      }
    }

    return globalThis.fetch.bind(globalThis)
  }

  const createClientRuntime = clientConfig => {
    if (workerData.clientModulePath) {
      const clientModule = runtimeRequire(workerData.clientModulePath)
      if (clientModule && typeof clientModule.createAnthropicClient === 'function') {
        return clientModule.createAnthropicClient(clientConfig)
      }
    }

    const anthropicModule = runtimeRequire('@anthropic-ai/sdk')
    const Anthropic = anthropicModule.default || anthropicModule

    return {
      client: new Anthropic({
        apiKey: clientConfig.apiKey,
        baseURL: clientConfig.baseURL,
        defaultHeaders: clientConfig.defaultHeaders,
        fetch: resolveWorkerFetch()
      }),
      model: clientConfig.model
    }
  }

  const waitForToolResult = (requestId, toolUseId) => {
    return new Promise((resolve, reject) => {
      pendingToolResults.set(requestId + ':' + toolUseId, { resolve, reject })
    })
  }

  const resolveToolResult = message => {
    const key = message.requestId + ':' + message.payload.toolUseId
    const pending = pendingToolResults.get(key)
    if (!pending) {
      return
    }

    pendingToolResults.delete(key)

    if (message.eventType === 'tool_error') {
      const error = new Error(message.payload.error && message.payload.error.message ? message.payload.error.message : 'Tool execution failed.')
      if (message.payload.error && message.payload.error.code) {
        error.code = message.payload.error.code
      }
      pending.reject(error)
      return
    }

    pending.resolve(message.payload.result)
  }

  parentPort.on('message', async message => {
    if (!message || !message.eventType) {
      return
    }

    if (message.eventType === 'tool_result' || message.eventType === 'tool_error') {
      resolveToolResult(message)
      return
    }

    if (message.eventType !== 'run_job') {
      return
    }

    const { requestId, payload } = message
    const runtime = createClientRuntime(payload.clientConfig)
    const request = {
      ...payload.request,
      model: payload.request.model || runtime.model
    }

    const documentPath = request.metadata && request.metadata.documentPath
    const messages = request.messages.slice()
    const conversationEntries = []
    let toolCallCount = 0

    try {
      while (true) {
        const response = await runtime.client.messages.create({
          ...request,
          messages
        })

        const assistantMessage = {
          role: 'assistant',
          content: response.content || []
        }
        messages.push(assistantMessage)
        conversationEntries.push(assistantMessage)

        const toolUses = (response.content || []).filter(block => block && block.type === 'tool_use')
        if (!toolUses.length) {
          parentPort.postMessage({
            requestId,
            eventType: 'completed',
            payload: {
              finalText: flattenText(response.content || []),
              conversationEntries
            }
          })
          return
        }

        toolCallCount += toolUses.length
        if (toolCallCount > ${MAX_TOOL_ITERATIONS}) {
          const error = new Error('Flowrite tool iteration limit exceeded (${MAX_TOOL_ITERATIONS}).')
          error.code = 'AI_TOOL_LOOP_LIMIT'
          throw error
        }

        const toolResults = []
        for (const toolUse of toolUses) {
          parentPort.postMessage({
            requestId,
            eventType: 'tool_call',
            payload: {
              documentPath,
              toolUseId: toolUse.id,
              name: toolUse.name,
              input: toolUse.input || {}
            }
          })

          const result = await waitForToolResult(requestId, toolUse.id)
          toolResults.push(buildToolResultBlock(toolUse.id, result))
        }

        const toolResultMessage = {
          role: 'user',
          content: toolResults
        }
        messages.push(toolResultMessage)
        conversationEntries.push(toolResultMessage)
      }
    } catch (error) {
      parentPort.postMessage({
        requestId,
        eventType: 'failed',
        payload: serializeError(error)
      })
    }
  })

  parentPort.postMessage({ eventType: 'ready' })
`

const isWorkerUnsupportedError = error => {
  return error && (
    error.code === 'ERR_MISSING_PLATFORM_FOR_WORKER' ||
    /does not support creating Workers/i.test(error.message || '')
  )
}

const createInlineRuntime = runtimeConfig => {
  const emitter = new EventEmitter()
  const runner = createJobRunner(emitter, {
    clientModulePath: runtimeConfig.clientModulePath || null,
    createClientRuntime: runtimeConfig.createClientRuntime
  })

  const runtime = {
    on: (eventName, handler) => {
      emitter.on(eventName, handler)
      return runtime
    },
    off: (eventName, handler) => {
      emitter.off(eventName, handler)
      return runtime
    },
    once: (eventName, handler) => {
      emitter.once(eventName, handler)
      return runtime
    },
    postMessage: message => {
      Promise.resolve().then(async () => {
        if (!message || !message.eventType) {
          return
        }

        if (message.eventType === 'tool_result' || message.eventType === 'tool_error') {
          runner.resolveToolResult(message)
          return
        }

        if (message.eventType === 'run_job') {
          await runner.runJob(message)
        }
      }).catch(error => {
        emitter.emit('error', error)
      })
    },
    terminate: async () => {
      emitter.removeAllListeners()
      return 0
    }
  }

  Promise.resolve().then(() => {
    emitter.emit('message', { eventType: 'ready' })
  })

  return runtime
}

export const createRuntimeWorker = (runtimeConfig = {}) => {
  if (typeof runtimeConfig.createWorker === 'function') {
    return runtimeConfig.createWorker()
  }

  try {
    return new Worker(buildRuntimeWorkerSource(), {
      eval: true,
      workerData: {
        clientModulePath: runtimeConfig.clientModulePath || null
      }
    })
  } catch (error) {
    if (isWorkerUnsupportedError(error) && runtimeConfig.allowInlineFallback !== false) {
      return createInlineRuntime(runtimeConfig)
    }
    throw error
  }
}

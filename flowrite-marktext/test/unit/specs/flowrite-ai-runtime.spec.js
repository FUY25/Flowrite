import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { expect } from 'chai'
import { FlowriteRuntimeManager } from '../../../src/main/flowrite/ai/runtimeManager'
import {
  DEFAULT_FLOWRITE_AI_BASE_URL,
  DEFAULT_FLOWRITE_MODEL,
  ensureAnthropicWebAPIs,
  getAnthropicClientConfig,
  resolveAnthropicFetch
} from '../../../src/main/flowrite/ai/anthropicClient'
import {
  buildRuntimeRequest,
  estimateTokens,
  REVIEW_PERSONA_INSTRUCTIONS,
  trimConversationHistory
} from '../../../src/main/flowrite/ai/promptBuilder'
import { MAX_TOOL_ITERATIONS } from '../../../src/main/flowrite/ai/runtimeWorker'
import { loadDocumentRecord } from '../../../src/main/flowrite/files/documentStore'
import * as documentStore from '../../../src/main/flowrite/files/documentStore'

describe('Flowrite AI runtime', function () {
  let tempRoot

  beforeEach(async function () {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-ai-runtime-'))
  })

  afterEach(async function () {
    await fs.remove(tempRoot)
  })

  const createStubClientModule = async (name, body) => {
    const pathname = path.join(tempRoot, `${name}.js`)
    await fs.writeFile(pathname, body, 'utf8')
    return pathname
  }

  it('boots the worker and completes a bootstrap request', async function () {
    const clientModulePath = await createStubClientModule('worker-boot-client', `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create () {
                return {
                  id: 'msg_boot',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: 'Ready.' }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath,
        createClientRuntime: () => ({
          client: {
            messages: {
              create: async () => ({
                id: 'msg_boot',
                role: 'assistant',
                stop_reason: 'end_turn',
                content: [{ type: 'text', text: 'Ready.' }]
              })
            }
          },
          model: 'test-model'
        })
      }
    })

    try {
      const result = await manager.runJob({
        jobType: 'bootstrap',
        documentPath: path.join(tempRoot, 'draft.md'),
        payload: {
          markdown: '# Draft\n',
          prompt: 'Help me reflect on this draft.'
        }
      })

      expect(result.finalText).to.equal('Ready.')
      expect(result.requestId).to.be.a('string')
    } finally {
      await manager.dispose()
    }
  })

  it('keeps request-response correlation when multiple jobs share one worker', async function () {
    const clientModulePath = await createStubClientModule('correlation-client', `
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create (request) {
                const lastMessage = request.messages[request.messages.length - 1]
                const promptBlock = lastMessage.content[lastMessage.content.length - 1]
                const prompt = promptBlock.text
                if (prompt.indexOf('Second request') !== -1) {
                  await delay(10)
                } else {
                  await delay(30)
                }
                return {
                  id: 'msg_' + prompt.replace(/\\W+/g, '_'),
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: 'done:' + prompt }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath,
        createClientRuntime: () => ({
          client: {
            messages: {
              create: async request => {
                const lastMessage = request.messages[request.messages.length - 1]
                const promptBlock = lastMessage.content[lastMessage.content.length - 1]
                const prompt = promptBlock.text
                if (prompt.indexOf('Second request') !== -1) {
                  await new Promise(resolve => setTimeout(resolve, 10))
                } else {
                  await new Promise(resolve => setTimeout(resolve, 30))
                }
                return {
                  id: 'msg_' + prompt.replace(/\\W+/g, '_'),
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: 'done:' + prompt }]
                }
              }
            }
          },
          model: 'test-model'
        })
      }
    })

    try {
      const [first, second] = await Promise.all([
        manager.runJob({
          jobType: 'thread_reply',
          documentPath: path.join(tempRoot, 'first.md'),
          payload: { markdown: '# First\n', prompt: 'First request' }
        }),
        manager.runJob({
          jobType: 'thread_reply',
          documentPath: path.join(tempRoot, 'second.md'),
          payload: { markdown: '# Second\n', prompt: 'Second request' }
        })
      ])

      expect(first.finalText).to.equal('done:First request')
      expect(second.finalText).to.equal('done:Second request')
      expect(first.requestId).to.not.equal(second.requestId)
    } finally {
      await manager.dispose()
    }
  })

  it('round-trips tool calls through the manager and persists one conversation history per article', async function () {
    const clientModulePath = await createStubClientModule('tool-loop-client', `
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
                        body: 'This paragraph makes two claims at once.'
                      }
                    }]
                  }
                }

                return {
                  id: 'msg_tool_2',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: 'Comment posted.' }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const toolCalls = []
    const documentPath = path.join(tempRoot, 'tool-loop.md')
    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath,
        createClientRuntime: () => {
          let callCount = 0
          return {
            client: {
              messages: {
                create: async () => {
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
                          body: 'This paragraph makes two claims at once.'
                        }
                      }]
                    }
                  }

                  return {
                    id: 'msg_tool_2',
                    role: 'assistant',
                    stop_reason: 'end_turn',
                    content: [{ type: 'text', text: 'Comment posted.' }]
                  }
                }
              }
            },
            model: 'test-model'
          }
        }
      },
      executeToolCall: async payload => {
        toolCalls.push(payload)
        return {
          ok: true,
          commentId: 'comment-1'
        }
      }
    })

    try {
      const result = await manager.runJob({
        jobType: 'thread_reply',
        documentPath,
        payload: {
          markdown: '# Draft\nBody\n',
          prompt: 'What feels unclear here?'
        }
      })
      const documentRecord = await loadDocumentRecord(documentPath)

      expect(result.finalText).to.equal('Comment posted.')
      expect(toolCalls).to.have.length(1)
      expect(toolCalls[0].name).to.equal('create_comment')
      expect(toolCalls[0].documentPath).to.equal(documentPath)
      expect(documentRecord.conversationHistory).to.be.an('array')
      expect(documentRecord.conversationHistory.length).to.be.above(0)
      expect(documentRecord.historyTokenEstimate).to.be.a('number').above(0)
    } finally {
      await manager.dispose()
    }
  })

  it('builds cacheable stable context blocks and gateway-backed client defaults', function () {
    const request = buildRuntimeRequest({
      jobType: 'thread_reply',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Give me a comment first.',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    const config = getAnthropicClientConfig({
      apiKey: 'gateway-key'
    })

    expect(request.system).to.be.an('array').with.length.above(1)
    expect(request.system[0].cache_control).to.deep.equal({ type: 'ephemeral' })
    expect(request.system.map(entry => entry.text)).to.include('Stay in commenting mode for this reply. Do not escalate into cowriting or draft a rewrite for the writer. Plain text only for comment bodies. Strip markdown headings, bold, italics, blockquotes, fenced code blocks, and tables from comment text. Bulleted and numbered lists are allowed when they keep the comment clear.')
    expect(request.messages[0].content[0].cache_control).to.deep.equal({ type: 'ephemeral' })
    expect(request.tools.map(tool => tool.name)).to.deep.equal(['create_comment'])
    expect(config.baseURL).to.equal(DEFAULT_FLOWRITE_AI_BASE_URL)
    expect(config.model).to.equal(DEFAULT_FLOWRITE_MODEL)
    expect(config.apiKey).to.equal('gateway-key')
    expect(config.defaultHeaders).to.have.property('x-flowrite-runtime', 'marktext')
  })

  it('passes collaboration metadata through the live runtime request builder for thread replies', async function () {
    const clientModulePath = await createStubClientModule('collaboration-metadata-client', `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create (request) {
                return {
                  id: 'msg_collaboration_metadata',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      collaborationMode: request.metadata.collaborationMode,
                      currentThreadMode: request.metadata.currentThreadMode,
                      nextThreadMode: request.metadata.nextThreadMode,
                      latestSystemInstruction: request.system[request.system.length - 1].text
                    })
                  }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath
      }
    })

    try {
      const result = await manager.runJob({
        jobType: 'thread_reply',
        documentPath: path.join(tempRoot, 'collaboration-metadata.md'),
        payload: {
          markdown: '# Draft\nParagraph.\n',
          prompt: 'Help with this.',
          collaborationMode: 'cowriting',
          currentThreadMode: 'commenting',
          latestUserMessage: 'Please rewrite this sentence for me.'
        }
      })

      const payload = JSON.parse(result.finalText)
      expect(payload.collaborationMode).to.equal('cowriting')
      expect(payload.currentThreadMode).to.equal('commenting')
      expect(payload.nextThreadMode).to.equal('cowriting')
      expect(payload.latestSystemInstruction).to.include('Cowriting mode is active for this reply.')
    } finally {
      await manager.dispose()
    }
  })

  it('resolves an explicit fetch implementation for Node 16 runtimes', function () {
    const fetchImpl = resolveAnthropicFetch()

    expect(fetchImpl).to.be.a('function')
  })

  it('installs the web API globals Anthropic expects when the runtime lacks them', function () {
    const fakeGlobal = {}
    const fakeWebApis = {
      fetch: () => Promise.resolve(),
      Headers: function Headers () {},
      Request: function Request () {},
      Response: function Response () {},
      FormData: function FormData () {},
      File: function File () {},
      Blob: function Blob () {}
    }

    ensureAnthropicWebAPIs(fakeGlobal, fakeWebApis)

    expect(fakeGlobal.fetch).to.equal(fakeWebApis.fetch)
    expect(fakeGlobal.Headers).to.equal(fakeWebApis.Headers)
    expect(fakeGlobal.Request).to.equal(fakeWebApis.Request)
    expect(fakeGlobal.Response).to.equal(fakeWebApis.Response)
    expect(fakeGlobal.FormData).to.equal(fakeWebApis.FormData)
  })

  it('only exposes rewrite tools for explicit suggestion requests', function () {
    const threadReplyRequest = buildRuntimeRequest({
      jobType: 'thread_reply',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Comment on this draft.',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    const suggestionRequest = buildRuntimeRequest({
      jobType: 'request_suggestion',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Rewrite this sentence.',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    expect(threadReplyRequest.tools.map(tool => tool.name)).to.deep.equal(['create_comment'])
    expect(suggestionRequest.tools.map(tool => tool.name)).to.deep.equal(['propose_suggestion'])
  })

  it('uses per-job output caps for AI review, thread replies, and suggestion requests', function () {
    const aiReviewRequest = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Review this draft.',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    const threadReplyRequest = buildRuntimeRequest({
      jobType: 'thread_reply',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Comment on this draft.',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    const suggestionRequest = buildRuntimeRequest({
      jobType: 'request_suggestion',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\nParagraph.\n',
      prompt: 'Rewrite this sentence.',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    expect(aiReviewRequest.max_tokens).to.equal(16384)
    expect(threadReplyRequest.max_tokens).to.equal(2048)
    expect(suggestionRequest.max_tokens).to.equal(2048)
  })

  it('adds distinct persona instructions to AI review requests', function () {
    const friendly = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\n',
      prompt: 'Review this draft.',
      reviewPersona: 'friendly',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    const critical = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\n',
      prompt: 'Review this draft.',
      reviewPersona: 'critical',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })
    const improvement = buildRuntimeRequest({
      jobType: 'ai_review',
      documentPath: '/tmp/draft.md',
      markdown: '# Draft\n',
      prompt: 'Review this draft.',
      reviewPersona: 'improvement',
      conversationHistory: [],
      model: DEFAULT_FLOWRITE_MODEL
    })

    expect(friendly.metadata.reviewPersona).to.equal('friendly')
    expect(critical.metadata.reviewPersona).to.equal('critical')
    expect(improvement.metadata.reviewPersona).to.equal('improvement')
    expect(REVIEW_PERSONA_INSTRUCTIONS.friendly).to.equal('Adopt a warm, encouraging review voice that uses reflective curiosity to help the writer notice what is working and what still needs attention without flattening their intent.')
    expect(REVIEW_PERSONA_INSTRUCTIONS.critical).to.equal('Adopt a rigorous, direct review voice that clearly identifies weak reasoning, vagueness, and unsupported leaps without softening the diagnosis.')
    expect(REVIEW_PERSONA_INSTRUCTIONS.improvement).to.equal('Adopt a practical revision voice focused on actionable next steps for clarity, structure, and stronger development of the writer\'s ideas.')
    expect(friendly.system.map(entry => entry.text)).to.include(REVIEW_PERSONA_INSTRUCTIONS.friendly)
    expect(critical.system.map(entry => entry.text)).to.include(REVIEW_PERSONA_INSTRUCTIONS.critical)
    expect(improvement.system.map(entry => entry.text)).to.include(REVIEW_PERSONA_INSTRUCTIONS.improvement)
    expect(friendly.system[1].text).to.equal(REVIEW_PERSONA_INSTRUCTIONS.friendly)
    expect(critical.system[1].text).to.equal(REVIEW_PERSONA_INSTRUCTIONS.critical)
    expect(improvement.system[1].text).to.equal(REVIEW_PERSONA_INSTRUCTIONS.improvement)
    expect(REVIEW_PERSONA_INSTRUCTIONS.friendly).to.not.equal(REVIEW_PERSONA_INSTRUCTIONS.critical)
    expect(REVIEW_PERSONA_INSTRUCTIONS.critical).to.not.equal(REVIEW_PERSONA_INSTRUCTIONS.improvement)
    expect(REVIEW_PERSONA_INSTRUCTIONS.friendly).to.not.equal(REVIEW_PERSONA_INSTRUCTIONS.improvement)
  })

  it('persists AI review conversation history and the selected persona after a successful review run', async function () {
    const documentPath = path.join(tempRoot, 'review-history.md')
    await fs.writeFile(documentPath, '# Draft\nBody\n', 'utf8')

    const clientModulePath = await createStubClientModule('review-history-client', `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create () {
                return {
                  id: 'msg_review_history',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: 'Review finished.' }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath
      }
    })

    try {
      const result = await manager.runJob({
        jobType: 'ai_review',
        documentPath,
        payload: {
          markdown: '# Draft\nBody\n',
          prompt: 'Review this draft.',
          reviewPersona: 'improvement'
        }
      })
      const documentRecord = await loadDocumentRecord(documentPath)

      expect(result.finalText).to.equal('Review finished.')
      expect(documentRecord.lastReviewPersona).to.equal('improvement')
      expect(documentRecord.conversationHistory).to.be.an('array')
      expect(documentRecord.conversationHistory.length).to.be.above(0)
      expect(documentRecord.historyTokenEstimate).to.be.a('number').above(0)
    } finally {
      await manager.dispose()
    }
  })

  it('maps offline client failures to AI_UNAVAILABLE', async function () {
    const clientModulePath = await createStubClientModule('offline-client', `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create () {
                const error = new Error('socket hang up')
                error.code = 'ENOTFOUND'
                throw error
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath,
        createClientRuntime: () => ({
          client: {
            messages: {
              create: async () => {
                const error = new Error('socket hang up')
                error.code = 'ENOTFOUND'
                throw error
              }
            }
          },
          model: 'test-model'
        })
      }
    })

    try {
      let error = null
      try {
        await manager.runJob({
          jobType: 'thread_reply',
          documentPath: path.join(tempRoot, 'offline.md'),
          payload: {
            markdown: '# Draft\n',
            prompt: 'What is weak here?'
          }
        })
      } catch (err) {
        error = err
      }

      expect(error).to.be.an('error')
      expect(error.code).to.equal('AI_UNAVAILABLE')
    } finally {
      await manager.dispose()
    }
  })

  it('respawns a fresh worker after a worker crash', async function () {
    let createWorkerCalls = 0
    const workers = []

    const createWorker = () => {
      createWorkerCalls += 1
      const worker = new (require('events').EventEmitter)()
      setTimeout(() => worker.emit('message', { eventType: 'ready' }), 0)
      worker.postMessage = message => {
        if (message.eventType !== 'run_job') {
          return
        }

        if (createWorkerCalls === 1) {
          setTimeout(() => worker.emit('error', Object.assign(new Error('worker crashed'), { code: 'ECONNRESET' })), 0)
          return
        }

        setTimeout(() => worker.emit('message', {
          requestId: message.requestId,
          eventType: 'completed',
          payload: {
            finalText: 'Recovered.',
            conversationEntries: [{ role: 'assistant', content: [{ type: 'text', text: 'Recovered.' }] }]
          }
        }), 0)
      }
      worker.terminate = async () => 0
      workers.push(worker)
      return worker
    }

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath: 'stub-runtime',
        createWorker
      }
    })

    try {
      let firstError = null
      try {
        await manager.runJob({
          jobType: 'thread_reply',
          documentPath: path.join(tempRoot, 'crash.md'),
          payload: {
            markdown: '# Draft\n',
            prompt: 'Crash once.'
          }
        })
      } catch (error) {
        firstError = error
      }

      const secondResult = await manager.runJob({
        jobType: 'thread_reply',
        documentPath: path.join(tempRoot, 'crash.md'),
        payload: {
          markdown: '# Draft\n',
          prompt: 'Recover now.'
        }
      })

      expect(firstError).to.be.an('error')
      expect(secondResult.finalText).to.equal('Recovered.')
      expect(createWorkerCalls).to.equal(2)
    } finally {
      await manager.dispose()
      workers.forEach(worker => worker.removeAllListeners())
    }
  })

  it('fails fast when the worker exits before startup completes', async function () {
    const workers = []
    const createWorker = () => {
      const worker = new (require('events').EventEmitter)()
      worker.postMessage = () => {}
      worker.terminate = async () => 0
      workers.push(worker)
      setTimeout(() => worker.emit('exit', 0), 0)
      return worker
    }

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath: 'stub-runtime',
        createWorker
      }
    })

    try {
      let error = null
      try {
        await Promise.race([
          manager.runJob({
            jobType: 'thread_reply',
            documentPath: path.join(tempRoot, 'startup-exit.md'),
            payload: {
              markdown: '# Draft\n',
              prompt: 'Exit before ready.'
            }
          }),
          new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('runJob hung on startup exit')), 100)
          })
        ])
      } catch (err) {
        error = err
      }

      expect(error).to.be.an('error')
      expect(error.message).to.not.equal('runJob hung on startup exit')
      expect(error.code).to.equal('AI_RUNTIME_EXIT')
    } finally {
      await manager.dispose()
      workers.forEach(worker => worker.removeAllListeners())
    }
  })

  it('drops stale tool results after a worker crash instead of posting them to the replacement worker', async function () {
    const workers = []
    let createWorkerCalls = 0
    let resolveFirstToolCall
    const firstToolCall = new Promise(resolve => {
      resolveFirstToolCall = resolve
    })

    const createWorker = () => {
      createWorkerCalls += 1
      const workerIndex = createWorkerCalls
      const worker = new (require('events').EventEmitter)()
      worker.toolResults = []
      worker.postMessage = message => {
        if (message.eventType === 'tool_result' || message.eventType === 'tool_error') {
          worker.toolResults.push(message)
          return
        }

        if (message.eventType !== 'run_job') {
          return
        }

        if (workerIndex === 1) {
          setTimeout(() => {
            worker.emit('message', {
              requestId: message.requestId,
              eventType: 'tool_call',
              payload: {
                documentPath: path.join(tempRoot, 'stale.md'),
                toolUseId: 'toolu_stale',
                name: 'create_comment',
                input: {
                  scope: 'global',
                  body: 'Crash during tool call.'
                }
              }
            })
            setTimeout(() => worker.emit('error', Object.assign(new Error('worker crashed'), { code: 'ECONNRESET' })), 0)
          }, 0)
          return
        }

        setTimeout(() => worker.emit('message', {
          requestId: message.requestId,
          eventType: 'completed',
          payload: {
            finalText: 'Recovered cleanly.',
            conversationEntries: [{ role: 'assistant', content: [{ type: 'text', text: 'Recovered cleanly.' }] }]
          }
        }), 0)
      }
      worker.terminate = async () => 0
      workers.push(worker)
      setTimeout(() => worker.emit('message', { eventType: 'ready' }), 0)
      return worker
    }

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath: 'stub-runtime',
        createWorker
      },
      executeToolCall: async ({ requestId }) => {
        if (requestId && createWorkerCalls === 1) {
          return firstToolCall
        }
        return { ok: true }
      }
    })

    try {
      let firstError = null
      const firstJob = manager.runJob({
        jobType: 'thread_reply',
        documentPath: path.join(tempRoot, 'stale.md'),
        payload: {
          markdown: '# Draft\n',
          prompt: 'Crash during tool call.'
        }
      }).catch(error => {
        firstError = error
      })

      await new Promise(resolve => setTimeout(resolve, 25))

      const secondResult = await manager.runJob({
        jobType: 'thread_reply',
        documentPath: path.join(tempRoot, 'stale.md'),
        payload: {
          markdown: '# Draft\n',
          prompt: 'Recover after crash.'
        }
      })

      resolveFirstToolCall({ ok: true })
      await firstJob
      await new Promise(resolve => setTimeout(resolve, 25))

      expect(firstError).to.be.an('error')
      expect(firstError.code).to.equal('AI_UNAVAILABLE')
      expect(secondResult.finalText).to.equal('Recovered cleanly.')
      expect(workers[1].toolResults).to.deep.equal([])
    } finally {
      await manager.dispose()
      workers.forEach(worker => worker.removeAllListeners())
    }
  })

  it('fails closed when the model exceeds the tool iteration limit', async function () {
    const clientModulePath = await createStubClientModule('loop-client', `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create () {
                return {
                  id: 'msg_loop',
                  role: 'assistant',
                  stop_reason: 'tool_use',
                  content: [{
                    type: 'tool_use',
                    id: 'toolu_loop',
                    name: 'create_comment',
                    input: {
                      scope: 'global',
                      body: 'Loop forever'
                    }
                  }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath
      },
      executeToolCall: async () => ({ ok: true })
    })

    try {
      let error = null
      try {
        await manager.runJob({
          jobType: 'thread_reply',
          documentPath: path.join(tempRoot, 'loop.md'),
          payload: {
            markdown: '# Draft\n',
            prompt: 'Loop forever.'
          }
        })
      } catch (err) {
        error = err
      }

      expect(error).to.be.an('error')
      expect(error.code).to.equal('AI_TOOL_LOOP_LIMIT')
    } finally {
      await manager.dispose()
    }
  })

  it('fails before executing an oversized batch of tool calls from one response', async function () {
    const clientModulePath = await createStubClientModule('tool-batch-client', `
      module.exports.createAnthropicClient = function createAnthropicClient () {
        return {
          client: {
            messages: {
              create: async function create () {
                return {
                  id: 'msg_batch',
                  role: 'assistant',
                  stop_reason: 'tool_use',
                  content: Array.from({ length: ${MAX_TOOL_ITERATIONS + 1} }, function (_, index) {
                    return {
                      type: 'tool_use',
                      id: 'toolu_' + index,
                      name: 'create_comment',
                      input: {
                        scope: 'global',
                        body: 'Comment ' + index
                      }
                    }
                  })
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    let toolCallCount = 0
    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath
      },
      executeToolCall: async () => {
        toolCallCount += 1
        return { ok: true }
      }
    })

    try {
      let error = null
      try {
        await manager.runJob({
          jobType: 'thread_reply',
          documentPath: path.join(tempRoot, 'tool-batch.md'),
          payload: {
            markdown: '# Draft\n',
            prompt: 'Flood the tool layer.'
          }
        })
      } catch (err) {
        error = err
      }

      expect(error).to.be.an('error')
      expect(error.code).to.equal('AI_TOOL_LOOP_LIMIT')
      expect(toolCallCount).to.equal(0)
    } finally {
      await manager.dispose()
    }
  })

  it('rejects in-flight requests when the runtime is disposed mid-job', async function () {
    const workers = []
    const createWorker = () => {
      const worker = new (require('events').EventEmitter)()
      worker.postMessage = () => {}
      worker.terminate = async () => {
        worker.emit('exit', 0)
        return 0
      }
      workers.push(worker)
      setTimeout(() => worker.emit('message', { eventType: 'ready' }), 0)
      return worker
    }

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath: 'stub-runtime',
        createWorker
      }
    })

    try {
      const pendingJob = manager.runJob({
        jobType: 'thread_reply',
        documentPath: path.join(tempRoot, 'dispose-mid-job.md'),
        payload: {
          markdown: '# Draft\n',
          prompt: 'Dispose this request.'
        }
      })

      await new Promise(resolve => setTimeout(resolve, 25))
      await manager.dispose()

      let error = null
      try {
        await Promise.race([
          pendingJob,
          new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('dispose left request hanging')), 100)
          })
        ])
      } catch (err) {
        error = err
      }

      expect(error).to.be.an('error')
      expect(error.message).to.not.equal('dispose left request hanging')
      expect(error.code).to.equal('AI_RUNTIME_DISPOSED')
    } finally {
      workers.forEach(worker => worker.removeAllListeners())
    }
  })

  it('does not split tool exchanges when trimming conversation history', function () {
    const history = [
      { role: 'user', content: [{ type: 'text', text: 'A'.repeat(600) }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'create_comment', input: { body: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Stored comment.' }] }
    ]

    const trimmed = trimConversationHistory(history, 10)

    expect(trimmed.conversationHistory).to.deep.equal([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'create_comment', input: { body: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Stored comment.' }] }
    ])
  })

  it('degrades history persistence failures after tool side effects succeed', async function () {
    const documentPath = path.join(tempRoot, 'history-save-failure.md')
    let toolCallCount = 0
    const clientModulePath = await createStubClientModule('history-save-failure-client', `
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
                        scope: 'global',
                        body: 'Persist me.'
                      }
                    }]
                  }
                }

                return {
                  id: 'msg_tool_2',
                  role: 'assistant',
                  stop_reason: 'end_turn',
                  content: [{ type: 'text', text: 'Comment posted.' }]
                }
              }
            }
          },
          model: 'test-model'
        }
      }
    `)

    const manager = new FlowriteRuntimeManager({
      runtimeConfig: {
        clientModulePath,
        documentStore: {
          loadDocumentRecord: documentStore.loadDocumentRecord,
          saveDocumentRecord: async () => {
            throw new Error('forced history save failure')
          }
        }
      },
      executeToolCall: async () => {
        toolCallCount += 1
        return { ok: true }
      }
    })

    try {
      const result = await manager.runJob({
        jobType: 'thread_reply',
        documentPath,
        payload: {
          markdown: '# Draft\n',
          prompt: 'Persist this comment.'
        }
      })

      expect(result.finalText).to.equal('Comment posted.')
      expect(result.historyPersistenceFailed).to.equal(true)
      expect(toolCallCount).to.equal(1)
    } finally {
      await manager.dispose()
    }
  })

  it('trims oldest history turns once the token budget is exceeded', function () {
    const history = [
      { role: 'user', content: [{ type: 'text', text: 'A'.repeat(400) }] },
      { role: 'assistant', content: [{ type: 'text', text: 'B'.repeat(400) }] },
      { role: 'user', content: [{ type: 'text', text: 'C'.repeat(400) }] }
    ]

    const before = estimateTokens(history)
    const trimmed = trimConversationHistory(history, 120)

    expect(before).to.be.above(120)
    expect(trimmed.historyTokenEstimate).to.be.at.most(120)
    expect(trimmed.trimmedCount).to.equal(2)
    expect(trimmed.conversationHistory).to.deep.equal([
      { role: 'user', content: [{ type: 'text', text: 'C'.repeat(400) }] }
    ])
  })
})

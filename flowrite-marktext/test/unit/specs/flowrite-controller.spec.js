import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { expect } from 'chai'
import { FlowriteController } from '../../../src/main/flowrite/controller'
import {
  isActionSeekingMessage,
  resolveNextThreadMode
} from '../../../src/main/flowrite/ai/collaborationRouting.js'
import {
  applyCommentGuardrails,
  COMMENT_GUARDRAILS_REJECTION_REASON
} from '../../../src/main/flowrite/ai/commentGuardrails.js'
import {
  FLOWRITE_GLOBAL_THREAD_ID,
  loadComments,
  saveComments
} from '../../../src/main/flowrite/files/commentsStore'
import {
  loadSuggestions,
  saveSuggestions
} from '../../../src/main/flowrite/files/suggestionsStore'
import {
  loadDocumentRecord,
  saveDocumentRecord
} from '../../../src/main/flowrite/files/documentStore'
import { getSidecarPaths } from '../../../src/main/flowrite/files/sidecarPaths'
import {
  FLOWRITE_THREAD_MODE_COMMENTING,
  FLOWRITE_THREAD_MODE_COWRITING,
  JOB_TYPE_AI_REVIEW
} from '../../../src/flowrite/constants'

describe('Flowrite controller', function () {
  let tempRoot

  beforeEach(async function () {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-controller-'))
  })

  afterEach(async function () {
    await fs.remove(tempRoot)
  })

  it('accepts cross-paragraph margin anchors and persists the thread before AI work starts', async function () {
    const pathname = path.join(tempRoot, 'cross-paragraph-margin.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    const calls = []
    controller.runtimeManager.runJob = async payload => {
      calls.push(payload)
      return { requestId: 'runtime-1', finalText: 'ok' }
    }

    try {
      await controller.submitMarginComment({
        pathname,
        markdown: '# Draft\n\nFirst paragraph.\n\nSecond paragraph.\n',
        body: 'Comment on this transition.',
        anchor: {
          quote: 'First paragraph. Second paragraph.',
          start: {
            key: 'paragraph-1',
            offset: 0
          },
          end: {
            key: 'paragraph-2',
            offset: 7
          }
        }
      })

      expect(calls).to.have.length(1)
      expect(calls[0].jobType).to.equal('thread_reply')
      expect(calls[0].payload.prompt).to.include('Selected quote: "First paragraph. Second paragraph."')
      expect(calls[0].payload.prompt).to.include('Primary anchor: start paragraph-1:0, end paragraph-2:7.')
      expect(calls[0].payload.threadId).to.be.a('string')
      expect(calls[0].payload.threadId).to.not.equal('')

      const comments = await loadComments(pathname)
      expect(comments).to.have.length(1)
      expect(comments[0].scope).to.equal('margin')
      expect(comments[0].anchor.start.key).to.equal('paragraph-1')
      expect(comments[0].anchor.end.key).to.equal('paragraph-2')
      expect(comments[0].comments).to.have.length(1)
      expect(comments[0].comments[0].body).to.equal('Comment on this transition.')
    } finally {
      await controller.dispose()
    }
  })

  it('deletes a margin thread through the controller and refreshes persisted state without changing the document record', async function () {
    const pathname = path.join(tempRoot, 'delete-thread.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    await saveSuggestions(pathname, [
      {
        id: 'suggestion-delete-me',
        threadId: 'thread-delete-me',
        status: 'pending',
        createdAt: '2026-04-10T12:00:00.000Z'
      },
      {
        id: 'suggestion-keep-me',
        threadId: 'thread-keep-me',
        status: 'pending',
        createdAt: '2026-04-10T12:05:00.000Z'
      }
    ])

    await saveDocumentRecord(pathname, {
      conversationHistory: [{
        role: 'assistant',
        text: 'Do not mutate this history.'
      }],
      historyTokenEstimate: 9,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement'
    })

    await saveComments(pathname, [{
      id: 'thread-delete-me',
      scope: 'margin',
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'comment-delete-me',
        author: 'assistant',
        body: 'Remove this thread.',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }, {
      id: 'thread-keep-me',
      scope: 'margin',
      createdAt: '2026-04-10T12:05:00.000Z',
      updatedAt: '2026-04-10T12:05:00.000Z',
      comments: [{
        id: 'comment-keep-me',
        author: 'assistant',
        body: 'Keep this thread.',
        createdAt: '2026-04-10T12:05:00.000Z'
      }]
    }])

    const messages = []
    const browserWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => {
          messages.push({ channel, payload })
        }
      }
    }

    try {
      const result = await controller.deleteThread({
        browserWindow,
        pathname,
        threadId: 'thread-delete-me'
      })

      const comments = await loadComments(pathname)
      const suggestions = await loadSuggestions(pathname)
      const documentRecord = await loadDocumentRecord(pathname)

      expect(result.deleted).to.equal(true)
      expect(result.pathname).to.equal(pathname)
      expect(result.comments.map(thread => thread.id)).to.deep.equal(['thread-keep-me'])
      expect(result.suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
      expect(comments.map(thread => thread.id)).to.deep.equal(['thread-keep-me'])
      expect(suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
      expect(documentRecord.conversationHistory).to.deep.equal([{
        role: 'assistant',
        text: 'Do not mutate this history.'
      }])
      expect(messages).to.have.length(1)
      expect(messages[0].channel).to.equal('mt::flowrite:tool-state-updated')
      expect(messages[0].payload.pathname).to.equal(pathname)
      expect(messages[0].payload.comments.map(thread => thread.id)).to.deep.equal(['thread-keep-me'])
      expect(messages[0].payload.suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
      expect(messages[0].payload.document).to.deep.equal(documentRecord)
    } finally {
      await controller.dispose()
    }
  })

  it('restores the linked suggestions file if the comment write fails during delete-thread', async function () {
    const pathname = path.join(tempRoot, 'delete-thread-rollback.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    const { commentsFile } = getSidecarPaths(pathname)

    await saveSuggestions(pathname, [
      {
        id: 'suggestion-delete-me',
        threadId: 'thread-delete-me',
        status: 'pending',
        createdAt: '2026-04-10T12:00:00.000Z'
      },
      {
        id: 'suggestion-keep-me',
        threadId: 'thread-keep-me',
        status: 'pending',
        createdAt: '2026-04-10T12:05:00.000Z'
      }
    ])

    await saveDocumentRecord(pathname, {
      conversationHistory: [{
        role: 'assistant',
        text: 'Do not mutate this history.'
      }],
      historyTokenEstimate: 9,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement'
    })

    await saveComments(pathname, [{
      id: 'thread-delete-me',
      scope: 'margin',
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'comment-delete-me',
        author: 'assistant',
        body: 'Remove this thread.',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }, {
      id: 'thread-keep-me',
      scope: 'margin',
      createdAt: '2026-04-10T12:05:00.000Z',
      updatedAt: '2026-04-10T12:05:00.000Z',
      comments: [{
        id: 'comment-keep-me',
        author: 'assistant',
        body: 'Keep this thread.',
        createdAt: '2026-04-10T12:05:00.000Z'
      }]
    }])

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (dest === commentsFile) {
        throw new Error('forced comment write failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    const messages = []
    const browserWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => {
          messages.push({ channel, payload })
        }
      }
    }

    try {
      let error = null
      try {
        await controller.deleteThread({
          browserWindow,
          pathname,
          threadId: 'thread-delete-me'
        })
      } catch (caughtError) {
        error = caughtError
      }

      const comments = await loadComments(pathname)
      const suggestions = await loadSuggestions(pathname)
      const documentRecord = await loadDocumentRecord(pathname)

      expect(error).to.be.an('error')
      expect(error.message).to.equal('forced comment write failure')
      expect(comments.map(thread => thread.id)).to.deep.equal([
        'thread-delete-me',
        'thread-keep-me'
      ])
      expect(suggestions.map(entry => entry.id)).to.deep.equal([
        'suggestion-delete-me',
        'suggestion-keep-me'
      ])
      expect(documentRecord.conversationHistory).to.deep.equal([{
        role: 'assistant',
        text: 'Do not mutate this history.'
      }])
      expect(messages).to.deep.equal([])
    } finally {
      fs.move = originalMove
      await controller.dispose()
    }
  })

  it('returns deleted false for unknown thread ids without mutating comments, suggestions, or document history', async function () {
    const pathname = path.join(tempRoot, 'unknown-thread.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    await saveDocumentRecord(pathname, {
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this history untouched.'
      }],
      historyTokenEstimate: 3,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement'
    })

    await saveComments(pathname, [{
      id: 'thread-keep-me',
      scope: 'margin',
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'comment-keep-me',
        author: 'assistant',
        body: 'Keep this thread.',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }])

    await saveSuggestions(pathname, [{
      id: 'suggestion-keep-me',
      threadId: 'thread-keep-me',
      status: 'pending',
      createdAt: '2026-04-10T12:00:00.000Z'
    }])

    const messages = []
    const browserWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => {
          messages.push({ channel, payload })
        }
      }
    }

    try {
      const result = await controller.deleteThread({
        browserWindow,
        pathname,
        threadId: 'thread-does-not-exist'
      })

      const comments = await loadComments(pathname)
      const suggestions = await loadSuggestions(pathname)
      const documentRecord = await loadDocumentRecord(pathname)

      expect(result.deleted).to.equal(false)
      expect(result.comments.map(thread => thread.id)).to.deep.equal(['thread-keep-me'])
      expect(result.suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
      expect(comments.map(thread => thread.id)).to.deep.equal(['thread-keep-me'])
      expect(suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
      expect(documentRecord.conversationHistory).to.deep.equal([{
        role: 'assistant',
        text: 'Keep this history untouched.'
      }])
      expect(messages).to.have.length(1)
      expect(messages[0].payload.comments.map(thread => thread.id)).to.deep.equal(['thread-keep-me'])
      expect(messages[0].payload.suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
    } finally {
      await controller.dispose()
    }
  })

  it('rejects global-thread deletion before mutating persisted comments or suggestions', async function () {
    const pathname = path.join(tempRoot, 'reject-global-delete.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    await saveDocumentRecord(pathname, {
      conversationHistory: [{
        role: 'assistant',
        text: 'This history should stay put.'
      }],
      historyTokenEstimate: 5,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement'
    })

    await saveComments(pathname, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'global-comment-1',
        author: 'assistant',
        body: 'Keep the global discussion.',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }, {
      id: 'thread-keep-me',
      scope: 'margin',
      createdAt: '2026-04-10T12:05:00.000Z',
      updatedAt: '2026-04-10T12:05:00.000Z',
      comments: [{
        id: 'comment-keep-me',
        author: 'assistant',
        body: 'Stay visible.',
        createdAt: '2026-04-10T12:05:00.000Z'
      }]
    }])

    await saveSuggestions(pathname, [{
      id: 'suggestion-keep-me',
      threadId: 'thread-keep-me',
      status: 'pending',
      createdAt: '2026-04-10T12:05:00.000Z'
    }])

    const messages = []
    const browserWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => {
          messages.push({ channel, payload })
        }
      }
    }

    try {
      let error = null
      try {
        await controller.deleteThread({
          browserWindow,
          pathname,
          threadId: FLOWRITE_GLOBAL_THREAD_ID
        })
      } catch (caughtError) {
        error = caughtError
      }

      const comments = await loadComments(pathname)
      const suggestions = await loadSuggestions(pathname)
      const documentRecord = await loadDocumentRecord(pathname)

      expect(error).to.be.an('error')
      expect(error.message).to.equal('Flowrite global thread cannot be deleted.')
      expect(comments.map(thread => thread.id)).to.deep.equal([
        FLOWRITE_GLOBAL_THREAD_ID,
        'thread-keep-me'
      ])
      expect(suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-keep-me'])
      expect(documentRecord.conversationHistory).to.deep.equal([{
        role: 'assistant',
        text: 'This history should stay put.'
      }])
      expect(messages).to.deep.equal([])
    } finally {
      await controller.dispose()
    }
  })

  it('keeps comment-only collaboration in commenting mode even for rewrite intent', function () {
    expect(isActionSeekingMessage('Can you rewrite this sentence and make it tighter?')).to.equal(true)
    expect(resolveNextThreadMode({
      collaborationMode: 'comment_only',
      currentThreadMode: 'commenting',
      latestUserMessage: 'Can you rewrite this sentence and make it tighter?'
    })).to.equal('commenting')
  })

  it('escalates cowriting threads from commenting to cowriting for rewrite intent', function () {
    expect(resolveNextThreadMode({
      collaborationMode: 'cowriting',
      currentThreadMode: 'commenting',
      latestUserMessage: 'Another wording for this opening paragraph?'
    })).to.equal('cowriting')
  })

  it('does not treat ordinary reflective comments as action-seeking rewrite requests', function () {
    expect(isActionSeekingMessage('This draft loses momentum in the middle.')).to.equal(false)
    expect(isActionSeekingMessage('Can you say more about why this feels vague?')).to.equal(false)
    expect(isActionSeekingMessage('This paragraph could be tighter emotionally.')).to.equal(false)
    expect(resolveNextThreadMode({
      collaborationMode: 'cowriting',
      currentThreadMode: 'commenting',
      latestUserMessage: 'This draft loses momentum in the middle.'
    })).to.equal('commenting')
    expect(resolveNextThreadMode({
      collaborationMode: 'cowriting',
      currentThreadMode: 'commenting',
      latestUserMessage: 'Can you say more about why this feels vague?'
    })).to.equal('commenting')
  })

  it('still recognizes explicit rewrite and drafting requests as action-seeking', function () {
    expect(isActionSeekingMessage('Please rewrite this sentence for me.')).to.equal(true)
    expect(isActionSeekingMessage('Can you say this differently?')).to.equal(true)
    expect(isActionSeekingMessage('Draft a reply to this note.')).to.equal(true)
  })

  it('strips markdown-heavy formatting from comment-mode output', function () {
    const result = applyCommentGuardrails({
      body: '# Heading\n\n**Bold note** with *extra emphasis*.\n\n> quoted thought\n\n- keep bullet\n\nPlease make this *tighter*\nAnd _clearer_\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
      threadMode: 'commenting'
    })

    expect(result.rejected).to.equal(false)
    expect(result.body).to.equal('Heading\n\nBold note with extra emphasis.\nquoted thought\n\n- keep bullet\n\nPlease make this tighter\nAnd clearer')
  })

  it('rejects empty comment-mode output after guardrail normalization', function () {
    const result = applyCommentGuardrails({
      body: '```js\nconst a = 1\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |',
      threadMode: 'commenting'
    })

    expect(result.rejected).to.equal(true)
    expect(result.reason).to.equal(COMMENT_GUARDRAILS_REJECTION_REASON)
  })

  it('plumbs collaboration metadata through the real global thread-reply path and persists escalated thread mode', async function () {
    const pathname = path.join(tempRoot, 'global-discussion.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true,
            collaborationMode: 'cowriting'
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    const calls = []
    controller.runtimeManager.runJob = async payload => {
      calls.push(payload)
      return { requestId: 'runtime-1', finalText: 'ok' }
    }

    try {
      await controller.submitGlobalComment({
        pathname,
        markdown: '# Draft\nParagraph.\n',
        body: 'Please rewrite this opening and write it out more clearly.'
      })

      expect(calls).to.have.length(1)
      expect(calls[0].jobType).to.equal('thread_reply')
      expect(calls[0].payload.collaborationMode).to.equal('cowriting')
      expect(calls[0].payload.currentThreadMode).to.equal('commenting')
      expect(calls[0].payload.latestUserMessage).to.equal('Please rewrite this opening and write it out more clearly.')

      const comments = await loadComments(pathname)
      expect(comments).to.have.length(1)
      expect(comments[0].id).to.equal(FLOWRITE_GLOBAL_THREAD_ID)
      expect(comments[0].interactionMode).to.equal(FLOWRITE_THREAD_MODE_COWRITING)
    } finally {
      await controller.dispose()
    }
  })

  it('uses the existing global thread cowriting mode in the runtime payload instead of a stale default', async function () {
    const pathname = path.join(tempRoot, 'existing-cowriting-global.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true,
            collaborationMode: 'cowriting'
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    await saveComments(pathname, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      interactionMode: FLOWRITE_THREAD_MODE_COWRITING,
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'comment-seed',
        author: 'assistant',
        body: 'Let us draft this together.',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }])

    const calls = []
    controller.runtimeManager.runJob = async payload => {
      calls.push(payload)
      return { requestId: 'runtime-2', finalText: 'ok' }
    }

    try {
      await controller.submitGlobalComment({
        pathname,
        markdown: '# Draft\nParagraph.\n',
        body: 'Please rewrite this again.'
      })

      expect(calls).to.have.length(1)
      expect(calls[0].payload.currentThreadMode).to.equal('cowriting')
      expect(calls[0].payload.collaborationMode).to.equal('cowriting')
      expect(calls[0].payload.latestUserMessage).to.equal('Please rewrite this again.')
    } finally {
      await controller.dispose()
    }
  })

  it('enforces comment guardrails on persisted assistant create_comment tool results', async function () {
    const pathname = path.join(tempRoot, 'assistant-comment.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true,
            collaborationMode: 'comment_only'
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    await saveComments(pathname, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      interactionMode: FLOWRITE_THREAD_MODE_COMMENTING,
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'comment-seed',
        author: 'user',
        body: 'Can you comment on this?',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }])

    try {
      await controller.executeToolCall({
        name: 'create_comment',
        documentPath: pathname,
        input: {
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          scope: 'global',
          body: '# Heading\n\n**Bold thought**\n\n> quoted bit'
        }
      })

      const comments = await loadComments(pathname)
      expect(comments[0].comments[1].body).to.equal('Heading\n\nBold thought\nquoted bit')
    } finally {
      await controller.dispose()
    }
  })

  it('keeps AI review comments in commenting mode even when the global thread has escalated to cowriting', async function () {
    const pathname = path.join(tempRoot, 'ai-review-comment-mode.md')
    const controller = new FlowriteController({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true,
            collaborationMode: 'cowriting'
          }
        },
        getRuntimeConfig () {
          return {}
        }
      }
    })

    await saveComments(pathname, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      interactionMode: FLOWRITE_THREAD_MODE_COWRITING,
      createdAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
      comments: [{
        id: 'comment-seed',
        author: 'assistant',
        body: 'Let us draft this together.',
        createdAt: '2026-04-10T12:00:00.000Z'
      }]
    }])

    try {
      await controller.executeToolCall({
        name: 'create_comment',
        documentPath: pathname,
        jobType: JOB_TYPE_AI_REVIEW,
        input: {
          threadId: FLOWRITE_GLOBAL_THREAD_ID,
          scope: 'global',
          body: 'Please make this *tighter*'
        }
      })

      const comments = await loadComments(pathname)
      expect(comments[0].interactionMode).to.equal(FLOWRITE_THREAD_MODE_COWRITING)
      expect(comments[0].comments[1].body).to.equal('Please make this tighter')
    } finally {
      await controller.dispose()
    }
  })
})

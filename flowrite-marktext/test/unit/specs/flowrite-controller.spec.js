import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { expect } from 'chai'
import DataCenter from '../../../src/main/dataCenter'
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
  configureDocumentIndex,
  rememberDocumentIndexEntry
} from '../../../src/main/flowrite/files/documentIndex'
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
    configureDocumentIndex({ rootPath: '' })
    await fs.remove(tempRoot)
  })

  it('uses the approved copy/fork prompt button text for copied documentId', async function () {
    const sourcePath = path.join(
      __dirname,
      '../../../src/main/dataCenter/index.js'
    )
    const source = await fs.readFile(sourcePath, 'utf8')

    expect(source).to.include("'Start new commenting session (recommended)'")
    expect(source).to.include("'Inherit existing comments'")
  })

  it('bootstraps a moved markdown file by reconnecting sidecars from the embedded documentId', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'draft.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-123',
      lastKnownMarkdownPath: oldPath
    })
    await saveComments(oldPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
      comments: [{
        id: 'comment-1',
        author: 'assistant',
        body: 'Keep me',
        createdAt: '2026-04-16T10:00:00.000Z'
      }]
    }])
    await rememberDocumentIndexEntry({
      documentId: 'doc-123',
      pathname: oldPath,
      documentDir: getSidecarPaths(oldPath).documentDir
    })

    await fs.move(oldPath, newPath)

    const reconcileCalls = []
    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown (pathname) {
          reconcileCalls.push(pathname)
        }
      }
    }, newPath)

    expect(reconcileCalls).to.deep.equal([newPath])
    expect(payload.document.documentId).to.equal('doc-123')
    expect(payload.document.lastKnownMarkdownPath).to.equal(newPath)
    expect(payload.documentId).to.equal('doc-123')
    expect(payload.pathname).to.equal(newPath)
    expect(payload.comments).to.have.length(1)
    expect(payload.comments[0].comments[0].body).to.equal('Keep me')
    expect(payload.runtimeReady).to.equal(true)
  })

  it('prompts once and starts a new commenting session when bootstrap detects a copied documentId', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'draft-copy.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await fs.writeFile(newPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-123',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Old history'
      }]
    })
    await saveComments(oldPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
      comments: [{
        id: 'comment-1',
        author: 'assistant',
        body: 'Keep me',
        createdAt: '2026-04-16T10:00:00.000Z'
      }]
    }])
    await rememberDocumentIndexEntry({
      documentId: 'doc-123',
      pathname: oldPath,
      documentDir: getSidecarPaths(oldPath).documentDir
    })

    const promptCalls = []
    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown () {}
      },
      async resolveDuplicateDocumentChoice (context) {
        promptCalls.push(context)
        return 'start_new_commenting_session'
      }
    }, newPath)

    const oldComments = await loadComments(oldPath)
    const newComments = await loadComments(newPath)
    const newRecord = await loadDocumentRecord(newPath)
    const newMarkdown = await fs.readFile(newPath, 'utf8')

    expect(promptCalls).to.have.length(1)
    expect(promptCalls[0].documentId).to.equal('doc-123')
    expect(promptCalls[0].pathname).to.equal(newPath)
    expect(promptCalls[0].existingPathname).to.equal(oldPath)
    expect(payload.documentId).to.match(/^[0-9a-f-]{36}$/)
    expect(payload.documentId).to.not.equal('doc-123')
    expect(payload.document.documentId).to.equal(payload.documentId)
    expect(payload.comments).to.deep.equal([])
    expect(newComments).to.deep.equal([])
    expect(payload.document.conversationHistory).to.deep.equal([])
    expect(newRecord.conversationHistory).to.deep.equal([])
    expect(oldComments).to.have.length(1)
    expect(oldComments[0].comments[0].body).to.equal('Keep me')
    expect(newMarkdown).to.equal(`<!-- flowrite:id=${payload.documentId} -->\n\n# Draft\n`)
    expect(await fs.pathExists(getSidecarPaths(oldPath).documentDir)).to.equal(true)
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(true)
  })

  it('prompts once and can inherit existing comments when bootstrap detects a copied documentId', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'draft-copy.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await fs.writeFile(newPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-123',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Old history'
      }],
      historyTokenEstimate: 11
    })
    await saveComments(oldPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
      comments: [{
        id: 'comment-1',
        author: 'assistant',
        body: 'Keep me',
        createdAt: '2026-04-16T10:00:00.000Z'
      }]
    }])
    await saveSuggestions(oldPath, [{
      id: 'suggestion-1',
      threadId: FLOWRITE_GLOBAL_THREAD_ID,
      status: 'pending',
      createdAt: '2026-04-16T10:00:00.000Z'
    }])
    await rememberDocumentIndexEntry({
      documentId: 'doc-123',
      pathname: oldPath,
      documentDir: getSidecarPaths(oldPath).documentDir
    })

    const promptCalls = []
    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown () {}
      },
      async resolveDuplicateDocumentChoice (context) {
        promptCalls.push(context)
        return 'inherit_existing_comments'
      }
    }, newPath)

    const oldComments = await loadComments(oldPath)
    const newComments = await loadComments(newPath)
    const newSuggestions = await loadSuggestions(newPath)
    const newRecord = await loadDocumentRecord(newPath)
    const newMarkdown = await fs.readFile(newPath, 'utf8')

    expect(promptCalls).to.have.length(1)
    expect(payload.documentId).to.match(/^[0-9a-f-]{36}$/)
    expect(payload.documentId).to.not.equal('doc-123')
    expect(payload.document.documentId).to.equal(payload.documentId)
    expect(payload.comments).to.have.length(1)
    expect(payload.comments[0].comments[0].body).to.equal('Keep me')
    expect(newComments).to.have.length(1)
    expect(newComments[0].comments[0].body).to.equal('Keep me')
    expect(payload.document.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Old history'
    }])
    expect(newRecord.historyTokenEstimate).to.equal(11)
    expect(payload.suggestions.map(entry => entry.id)).to.deep.equal(['suggestion-1'])
    expect(newSuggestions.map(entry => entry.id)).to.deep.equal(['suggestion-1'])
    expect(oldComments).to.have.length(1)
    expect(oldComments[0].comments[0].body).to.equal('Keep me')
    expect(newMarkdown).to.equal(`<!-- flowrite:id=${payload.documentId} -->\n\n# Draft\n`)
    expect(await fs.pathExists(getSidecarPaths(oldPath).documentDir)).to.equal(true)
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(true)
  })

  it('writes a generated documentId into markdown during bootstrap for legacy files', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'legacy-bootstrap.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, '# Draft\n', 'utf8')

    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown () {}
      }
    }, pathname)

    const markdown = await fs.readFile(pathname, 'utf8')

    expect(payload).to.have.property('documentId', payload.document.documentId)
    expect(payload.documentId).to.match(/^[0-9a-f-]{36}$/)
    expect(payload.document.documentId).to.equal(payload.documentId)
    expect(markdown).to.equal(`<!-- flowrite:id=${payload.documentId} -->\n\n# Draft\n`)
  })

  it('writes the embedded documentId marker for an existing sidecar-backed legacy bootstrap without changing the id', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'existing-sidecar-bootstrap.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, '# Draft\n', 'utf8')
    await saveDocumentRecord(pathname, {
      documentId: 'doc-existing',
      lastKnownMarkdownPath: pathname,
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this history'
      }]
    })

    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown () {}
      }
    }, pathname)

    const markdown = await fs.readFile(pathname, 'utf8')

    expect(payload.documentId).to.equal('doc-existing')
    expect(payload.document.documentId).to.equal('doc-existing')
    expect(payload.document.lastKnownMarkdownPath).to.equal(pathname)
    expect(payload.document.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this history'
    }])
    expect(markdown).to.equal('<!-- flowrite:id=doc-existing -->\n\n# Draft\n')
  })

  it('prompts once and forks a copied legacy sidecar into a fresh commenting session', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'legacy-source.md')
    const newPath = path.join(tempRoot, 'archive', 'legacy-copy.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '# Legacy draft\n', 'utf8')
    await fs.writeFile(newPath, '# Legacy draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-legacy',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Original legacy history'
      }]
    })
    await saveComments(oldPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T14:00:00.000Z',
      updatedAt: '2026-04-16T14:00:00.000Z',
      comments: [{
        id: 'legacy-comment-1',
        author: 'assistant',
        body: 'Original legacy comment',
        createdAt: '2026-04-16T14:00:00.000Z'
      }]
    }])

    // Simulate a copied legacy sidecar before bootstrap has injected an HTML id comment.
    await saveDocumentRecord(newPath, {
      documentId: 'doc-legacy',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Copied legacy history'
      }]
    })
    await saveComments(newPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T14:05:00.000Z',
      updatedAt: '2026-04-16T14:05:00.000Z',
      comments: [{
        id: 'legacy-comment-copy',
        author: 'assistant',
        body: 'Copied legacy comment',
        createdAt: '2026-04-16T14:05:00.000Z'
      }]
    }])

    const promptCalls = []
    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: true,
            configured: true,
            online: true
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown () {}
      },
      async resolveDuplicateDocumentChoice (context) {
        promptCalls.push(context)
        return 'start_new_commenting_session'
      }
    }, newPath)

    const originalRecord = await loadDocumentRecord(oldPath)
    const originalComments = await loadComments(oldPath)
    const copiedRecord = await loadDocumentRecord(newPath)
    const copiedComments = await loadComments(newPath)
    const copiedMarkdown = await fs.readFile(newPath, 'utf8')

    expect(promptCalls).to.have.length(1)
    expect(promptCalls[0].documentId).to.equal('doc-legacy')
    expect(promptCalls[0].pathname).to.equal(newPath)
    expect(promptCalls[0].existingPathname).to.equal(oldPath)
    expect(payload.documentId).to.match(/^[0-9a-f-]{36}$/)
    expect(payload.documentId).to.not.equal('doc-legacy')
    expect(payload.document.documentId).to.equal(payload.documentId)
    expect(payload.document.conversationHistory).to.deep.equal([])
    expect(payload.comments).to.deep.equal([])
    expect(copiedRecord.documentId).to.equal(payload.documentId)
    expect(copiedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(copiedRecord.conversationHistory).to.deep.equal([])
    expect(copiedComments).to.deep.equal([])
    expect(copiedMarkdown).to.equal(`<!-- flowrite:id=${payload.documentId} -->\n\n# Legacy draft\n`)
    expect(originalRecord.documentId).to.equal('doc-legacy')
    expect(originalRecord.lastKnownMarkdownPath).to.equal(oldPath)
    expect(originalRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Original legacy history'
    }])
    expect(originalComments).to.have.length(1)
    expect(originalComments[0].comments[0].body).to.equal('Original legacy comment')
  })

  it('keeps disabled bootstrap read-only for legacy markdown even when a sidecar documentId already exists', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'disabled-legacy.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, '# Disabled legacy draft\n', 'utf8')
    await saveDocumentRecord(pathname, {
      documentId: 'doc-disabled',
      lastKnownMarkdownPath: pathname,
      conversationHistory: [{
        role: 'assistant',
        text: 'Read-only history'
      }]
    })
    await saveComments(pathname, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T15:00:00.000Z',
      updatedAt: '2026-04-16T15:00:00.000Z',
      comments: [{
        id: 'disabled-comment-1',
        author: 'assistant',
        body: 'Read-only comment',
        createdAt: '2026-04-16T15:00:00.000Z'
      }]
    }])

    const reconcileCalls = []
    const payload = await DataCenter.prototype.bootstrapFlowriteDocument.call({
      flowriteSettings: {
        getPublicState () {
          return {
            enabled: false,
            configured: false,
            online: false
          }
        }
      },
      flowriteController: {
        async reconcileSuggestionsWithMarkdown (targetPath) {
          reconcileCalls.push(targetPath)
        }
      }
    }, pathname)

    const markdown = await fs.readFile(pathname, 'utf8')
    const paths = getSidecarPaths(pathname)

    expect(reconcileCalls).to.deep.equal([])
    expect(payload.runtimeReady).to.equal(false)
    expect(payload.document.documentId).to.equal('doc-disabled')
    expect(payload.document.lastKnownMarkdownPath).to.equal(pathname)
    expect(payload.document.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Read-only history'
    }])
    expect(payload.documentId).to.equal(undefined)
    expect(payload.pathname).to.equal(pathname)
    expect(payload.comments).to.have.length(1)
    expect(payload.comments[0].comments[0].body).to.equal('Read-only comment')
    expect(payload.suggestions).to.deep.equal([])
    expect(markdown).to.equal('# Disabled legacy draft\n')
    expect(await fs.pathExists(paths.documentDir)).to.equal(true)
    expect(await fs.pathExists(paths.documentFile)).to.equal(true)
    expect(await fs.pathExists(paths.commentsFile)).to.equal(true)
    expect(await fs.pathExists(paths.suggestionsFile)).to.equal(false)
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

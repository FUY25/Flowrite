import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import { expect } from 'chai'
import { loadMarkdownFile, writeMarkdownFile } from '../../../src/main/filesystem/markdown'
import {
  getSidecarPaths
} from '../../../src/main/flowrite/files/sidecarPaths'
import {
  configureDocumentIndex,
  findDocumentIndexEntry,
  rememberDocumentIndexEntry
} from '../../../src/main/flowrite/files/documentIndex'
import {
  loadDocumentRecord,
  migrateSidecarDirectory,
  ensureDocumentIdentityForPath,
  saveDocumentRecord,
  moveDocumentWithSidecars,
  moveFileSystemItemWithFlowriteIdentity
} from '../../../src/main/flowrite/files/documentStore'
import {
  createMarginAnchor
} from '../../../src/flowrite/anchors'
import {
  FLOWRITE_GLOBAL_THREAD_ID,
  appendCommentToThread,
  deleteThreadFromComments,
  loadComments,
  normalizeComments,
  saveComments
} from '../../../src/main/flowrite/files/commentsStore'
import {
  loadSuggestions,
  saveSuggestions
} from '../../../src/main/flowrite/files/suggestionsStore'
import {
  ensureSnapshotForAcceptedSuggestion,
  listSnapshots
} from '../../../src/main/flowrite/files/snapshotStore'
import {
  SCOPE_MARGIN,
  FLOWRITE_THREAD_MODE_COMMENTING,
  FLOWRITE_THREAD_MODE_COWRITING,
  THREAD_STATUS_RESOLVED,
  AUTHOR_ASSISTANT
} from '../../../src/flowrite/constants'

describe('Flowrite sidecar storage', function () {
  const markdownOptions = {
    adjustLineEndingOnSave: false,
    lineEnding: 'lf',
    encoding: {
      encoding: 'utf8',
      isBom: false
    }
  }

  let tempRoot

  const getCommentBodies = async pathname => {
    const comments = await loadComments(pathname)
    return comments.flatMap(thread => thread.comments.map(comment => comment.body))
  }

  beforeEach(async function () {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowrite-storage-'))
  })

  afterEach(async function () {
    configureDocumentIndex({ rootPath: '' })
    await fs.remove(tempRoot)
  })

  it('derives sidecar paths inside a per-document namespace', function () {
    const pathname = path.join(tempRoot, 'Notes', 'Quarterly Review.md')
    const paths = getSidecarPaths(pathname)

    expect(paths.flowriteRoot).to.equal(path.join(tempRoot, 'Notes', '.flowrite'))
    expect(paths.documentSlug).to.equal('quarterly-review')
    expect(paths.pathHash).to.match(/^[a-f0-9]{12}$/)
    expect(path.basename(paths.documentDir)).to.equal(`quarterly-review-${paths.pathHash}`)
    expect(paths.documentFile).to.equal(path.join(paths.documentDir, 'document.json'))
    expect(paths.commentsFile).to.equal(path.join(paths.documentDir, 'comments.json'))
    expect(paths.suggestionsFile).to.equal(path.join(paths.documentDir, 'suggestions.json'))
    expect(paths.snapshotsDir).to.equal(path.join(paths.documentDir, 'snapshots'))
  })

  it('recovers from corrupt JSON by quarantining the bad file and returning defaults', async function () {
    const pathname = path.join(tempRoot, 'draft.md')
    const { commentsFile } = getSidecarPaths(pathname)

    await fs.ensureDir(path.dirname(commentsFile))
    await fs.writeFile(commentsFile, '{"broken":', 'utf8')

    const comments = await loadComments(pathname)
    const sidecarEntries = await fs.readdir(path.dirname(commentsFile))

    expect(comments).to.deep.equal([])
    expect(sidecarEntries).to.include('comments.json.corrupt')
    expect(sidecarEntries).to.not.include('comments.json')
  })

  it('quarantines wrong-shaped comments sidecars instead of silently dropping them', async function () {
    const pathname = path.join(tempRoot, 'draft.md')
    const { commentsFile } = getSidecarPaths(pathname)

    await fs.ensureDir(path.dirname(commentsFile))
    await fs.writeJson(commentsFile, {
      unexpected: true
    })

    const comments = await loadComments(pathname)
    const sidecarEntries = await fs.readdir(path.dirname(commentsFile))

    expect(comments).to.deep.equal([])
    expect(sidecarEntries).to.include('comments.json.corrupt')
    expect(sidecarEntries).to.not.include('comments.json')
  })

  it('normalizes legacy threads to commenting by default', function () {
    const normalized = normalizeComments([{
      scope: 'global',
      author: 'assistant',
      body: 'Legacy feedback still matters.',
      createdAt: '2026-04-09T10:00:00.000Z'
    }])

    expect(normalized).to.have.length(1)
    expect(normalized[0].interactionMode).to.equal(FLOWRITE_THREAD_MODE_COMMENTING)
  })

  it('defaults thread-shaped records without interactionMode to commenting after save and load', async function () {
    const pathname = path.join(tempRoot, 'thread-shaped-legacy.md')
    const { commentsFile } = getSidecarPaths(pathname)

    await fs.ensureDir(path.dirname(commentsFile))
    await fs.writeJson(commentsFile, [{
      id: 'thread-shaped-legacy',
      scope: 'global',
      createdAt: '2026-04-09T10:00:00.000Z',
      updatedAt: '2026-04-09T10:05:00.000Z',
      comments: [{
        id: 'thread-shaped-comment-1',
        author: 'assistant',
        body: 'Thread-shaped legacy record.',
        createdAt: '2026-04-09T10:00:00.000Z'
      }]
    }])

    const comments = await loadComments(pathname)

    expect(comments).to.have.length(1)
    expect(comments[0].interactionMode).to.equal(FLOWRITE_THREAD_MODE_COMMENTING)
    expect(comments[0].comments).to.have.length(1)
    expect(comments[0].comments[0].body).to.equal('Thread-shaped legacy record.')
  })

  it('normalizes legacy comments into a global thread and appends new replies into that thread', async function () {
    const pathname = path.join(tempRoot, 'discussion.md')

    await saveComments(pathname, [{
      scope: 'global',
      author: 'assistant',
      body: 'Legacy feedback still matters.',
      createdAt: '2026-04-09T10:00:00.000Z'
    }])

    const firstPass = await loadComments(pathname)
    expect(firstPass).to.have.length(1)
    expect(firstPass[0].id).to.equal(FLOWRITE_GLOBAL_THREAD_ID)
    expect(firstPass[0].comments).to.have.length(1)
    expect(firstPass[0].comments[0].body).to.equal('Legacy feedback still matters.')

    await appendCommentToThread(pathname, {
      threadId: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      author: 'user',
      body: 'Can you go deeper on that?'
    })

    const secondPass = await loadComments(pathname)
    expect(secondPass).to.have.length(1)
    expect(secondPass[0].comments.map(comment => comment.body)).to.deep.equal([
      'Legacy feedback still matters.',
      'Can you go deeper on that?'
    ])
  })

  it('deletes only the requested margin thread and leaves the document record untouched', async function () {
    const pathname = path.join(tempRoot, 'delete-margin-thread.md')
    const anchor = createMarginAnchor({
      start: { key: 'ag-para-1', offset: 0 },
      end: { key: 'ag-para-1', offset: 9 },
      quote: 'Margin text',
      startBlockText: 'Margin text with a useful note.',
      endBlockText: 'Margin text with a useful note.'
    })

    await saveDocumentRecord(pathname, {
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this memory intact.'
      }],
      historyTokenEstimate: 17,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement'
    })

    await saveComments(pathname, [
      {
        id: FLOWRITE_GLOBAL_THREAD_ID,
        scope: 'global',
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:00:00.000Z',
        comments: [{
          id: 'global-comment-1',
          author: 'assistant',
          body: 'Keep the global thread.',
          createdAt: '2026-04-09T10:00:00.000Z'
        }]
      },
      {
        id: 'margin-thread-1',
        scope: SCOPE_MARGIN,
        anchor,
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:05:00.000Z',
        comments: [{
          id: 'margin-comment-1',
          author: 'assistant',
          body: 'Delete this thread.',
          createdAt: '2026-04-09T10:05:00.000Z'
        }]
      },
      {
        id: 'margin-thread-2',
        scope: SCOPE_MARGIN,
        anchor: createMarginAnchor({
          start: { key: 'ag-para-2', offset: 0 },
          end: { key: 'ag-para-2', offset: 6 },
          quote: 'Keep me',
          startBlockText: 'Keep me around.',
          endBlockText: 'Keep me around.'
        }),
        createdAt: '2026-04-09T11:00:00.000Z',
        updatedAt: '2026-04-09T11:00:00.000Z',
        comments: [{
          id: 'margin-comment-2',
          author: 'assistant',
          body: 'Stay visible.',
          createdAt: '2026-04-09T11:00:00.000Z'
        }]
      }
    ])

    const result = await deleteThreadFromComments(pathname, {
      threadId: 'margin-thread-1'
    })

    const comments = await loadComments(pathname)
    const documentRecord = await loadDocumentRecord(pathname)

    expect(result.deleted).to.equal(true)
    expect(result.comments.map(thread => thread.id)).to.deep.equal([
      FLOWRITE_GLOBAL_THREAD_ID,
      'margin-thread-2'
    ])
    expect(comments.map(thread => thread.id)).to.deep.equal([
      FLOWRITE_GLOBAL_THREAD_ID,
      'margin-thread-2'
    ])
    expect(comments[1].comments[0].body).to.equal('Stay visible.')
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this memory intact.'
    }])
    expect(documentRecord.historyTokenEstimate).to.equal(17)
    expect(documentRecord.responseStyle).to.equal('comment_only')
    expect(documentRecord.lastReviewPersona).to.equal('improvement')
  })

  it('returns the compacted persisted comments and pathname after deleting a margin thread', async function () {
    const pathname = path.join(tempRoot, 'delete-thread-persisted-state.md')
    const { commentsFile } = getSidecarPaths(pathname)
    const keptComments = Array.from({ length: 201 }, (_, index) => ({
      id: `keep-comment-${index + 1}`,
      author: 'assistant',
      body: `Keep ${index + 1}`,
      createdAt: `2026-04-09T10:${String(index % 60).padStart(2, '0')}:00.000Z`
    }))

    await fs.ensureDir(path.dirname(commentsFile))
    await fs.writeJson(commentsFile, [
      {
        id: 'margin-thread-delete',
        scope: SCOPE_MARGIN,
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:05:00.000Z',
        comments: [{
          id: 'delete-comment-1',
          author: 'assistant',
          body: 'Delete this thread.',
          createdAt: '2026-04-09T10:05:00.000Z'
        }]
      },
      {
        id: 'margin-thread-keep',
        scope: SCOPE_MARGIN,
        createdAt: '2026-04-09T11:00:00.000Z',
        updatedAt: '2026-04-09T11:00:00.000Z',
        comments: keptComments
      }
    ])

    const result = await deleteThreadFromComments(pathname, {
      threadId: 'margin-thread-delete'
    })
    const comments = await loadComments(pathname)

    expect(result.pathname).to.equal(pathname)
    expect(result.deleted).to.equal(true)
    expect(result.comments).to.deep.equal(comments)
    expect(result.comments).to.have.length(1)
    expect(result.comments[0].comments).to.have.length(200)
    expect(result.comments[0].comments[0].body).to.equal('Keep 2')
    expect(result.comments[0].comments[199].body).to.equal('Keep 201')
  })

  it('rolls back linked suggestion pruning when the comment write fails during delete-thread', async function () {
    const pathname = path.join(tempRoot, 'delete-thread-rollback.md')
    const { commentsFile, suggestionsFile } = getSidecarPaths(pathname)
    const anchor = createMarginAnchor({
      start: { key: 'ag-para-1', offset: 0 },
      end: { key: 'ag-para-1', offset: 9 },
      quote: 'Margin text',
      startBlockText: 'Margin text with a useful note.',
      endBlockText: 'Margin text with a useful note.'
    })

    await saveDocumentRecord(pathname, {
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this memory intact.'
      }],
      historyTokenEstimate: 17,
      responseStyle: 'comment_only',
      lastReviewPersona: 'improvement'
    })

    await saveComments(pathname, [
      {
        id: 'margin-thread-1',
        scope: SCOPE_MARGIN,
        anchor,
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:05:00.000Z',
        comments: [{
          id: 'margin-comment-1',
          author: 'assistant',
          body: 'Delete this thread.',
          createdAt: '2026-04-09T10:05:00.000Z'
        }]
      },
      {
        id: 'margin-thread-2',
        scope: SCOPE_MARGIN,
        anchor: createMarginAnchor({
          start: { key: 'ag-para-2', offset: 0 },
          end: { key: 'ag-para-2', offset: 6 },
          quote: 'Keep me',
          startBlockText: 'Keep me around.',
          endBlockText: 'Keep me around.'
        }),
        createdAt: '2026-04-09T11:00:00.000Z',
        updatedAt: '2026-04-09T11:00:00.000Z',
        comments: [{
          id: 'margin-comment-2',
          author: 'assistant',
          body: 'Stay visible.',
          createdAt: '2026-04-09T11:00:00.000Z'
        }]
      }
    ])

    await saveSuggestions(pathname, [
      {
        id: 'suggestion-delete-me',
        threadId: 'margin-thread-1',
        status: 'pending',
        createdAt: '2026-04-09T10:05:00.000Z'
      },
      {
        id: 'suggestion-keep-me',
        threadId: 'margin-thread-2',
        status: 'pending',
        createdAt: '2026-04-09T11:00:00.000Z'
      }
    ])

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (dest === commentsFile) {
        throw new Error('forced comment write failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await deleteThreadFromComments(pathname, {
        threadId: 'margin-thread-1'
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const comments = await loadComments(pathname)
    const suggestions = await loadSuggestions(pathname)
    const documentRecord = await loadDocumentRecord(pathname)

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced comment write failure')
    expect(comments.map(thread => thread.id)).to.deep.equal([
      'margin-thread-1',
      'margin-thread-2'
    ])
    expect(suggestions.map(entry => entry.id)).to.deep.equal([
      'suggestion-delete-me',
      'suggestion-keep-me'
    ])
    expect(await fs.pathExists(suggestionsFile)).to.equal(true)
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this memory intact.'
    }])
  })

  it('rolls back the deleted comment thread when linked suggestion cleanup fails after comment persistence begins', async function () {
    const pathname = path.join(tempRoot, 'delete-thread-atomic-rollback.md')
    const { suggestionsFile } = getSidecarPaths(pathname)
    const anchor = createMarginAnchor({
      start: { key: 'ag-para-1', offset: 0 },
      end: { key: 'ag-para-1', offset: 9 },
      quote: 'Margin text',
      startBlockText: 'Margin text with a useful note.',
      endBlockText: 'Margin text with a useful note.'
    })

    await saveComments(pathname, [
      {
        id: 'margin-thread-1',
        scope: SCOPE_MARGIN,
        anchor,
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:05:00.000Z',
        comments: [{
          id: 'margin-comment-1',
          author: 'assistant',
          body: 'Delete this thread.',
          createdAt: '2026-04-09T10:05:00.000Z'
        }]
      },
      {
        id: 'margin-thread-2',
        scope: SCOPE_MARGIN,
        anchor: createMarginAnchor({
          start: { key: 'ag-para-2', offset: 0 },
          end: { key: 'ag-para-2', offset: 6 },
          quote: 'Keep me',
          startBlockText: 'Keep me around.',
          endBlockText: 'Keep me around.'
        }),
        createdAt: '2026-04-09T11:00:00.000Z',
        updatedAt: '2026-04-09T11:00:00.000Z',
        comments: [{
          id: 'margin-comment-2',
          author: 'assistant',
          body: 'Stay visible.',
          createdAt: '2026-04-09T11:00:00.000Z'
        }]
      }
    ])

    await saveSuggestions(pathname, [
      {
        id: 'suggestion-delete-me',
        threadId: 'margin-thread-1',
        status: 'pending',
        createdAt: '2026-04-09T10:05:00.000Z'
      },
      {
        id: 'suggestion-keep-me',
        threadId: 'margin-thread-2',
        status: 'pending',
        createdAt: '2026-04-09T11:00:00.000Z'
      }
    ])

    const originalMove = fs.move
    let commentsWriteSucceeded = false
    fs.move = async function (src, dest, options) {
      if (dest.endsWith('comments.json')) {
        commentsWriteSucceeded = true
      }
      if (dest === suggestionsFile) {
        throw new Error('forced suggestions write failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await deleteThreadFromComments(pathname, {
        threadId: 'margin-thread-1'
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const comments = await loadComments(pathname)
    const suggestions = await loadSuggestions(pathname)

    expect(commentsWriteSucceeded).to.equal(true)
    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced suggestions write failure')
    expect(comments.map(thread => thread.id)).to.deep.equal([
      'margin-thread-1',
      'margin-thread-2'
    ])
    expect(suggestions.map(entry => entry.id)).to.deep.equal([
      'suggestion-delete-me',
      'suggestion-keep-me'
    ])
  })

  it('preserves explicit cowriting interaction mode through save and load', async function () {
    const pathname = path.join(tempRoot, 'cowriting-thread.md')

    await saveComments(pathname, [{
      id: 'thread-cowriting',
      scope: 'global',
      interactionMode: FLOWRITE_THREAD_MODE_COWRITING,
      createdAt: '2026-04-09T10:00:00.000Z',
      updatedAt: '2026-04-09T10:00:00.000Z',
      comments: [{
        id: 'cowriting-comment-1',
        author: 'assistant',
        body: "Let's draft this together.",
        createdAt: '2026-04-09T10:00:00.000Z'
      }]
    }])

    const comments = await loadComments(pathname)

    expect(comments).to.have.length(1)
    expect(comments[0].interactionMode).to.equal(FLOWRITE_THREAD_MODE_COWRITING)
    expect(comments[0].comments[0].body).to.equal("Let's draft this together.")
  })

  it('preserves an existing margin anchor when appending replies without a replacement anchor', async function () {
    const pathname = path.join(tempRoot, 'margin-thread.md')
    const anchor = createMarginAnchor({
      start: {
        key: 'ag-para-1',
        offset: 2
      },
      end: {
        key: 'ag-para-1',
        offset: 20
      },
      quote: 'reflective paragraph',
      startBlockText: 'A reflective paragraph with a soft cadence.',
      endBlockText: 'A reflective paragraph with a soft cadence.'
    })

    const created = await appendCommentToThread(pathname, {
      threadId: 'thread-margin-1',
      scope: 'margin',
      anchor,
      author: 'user',
      body: 'Can you make this sentence sharper?'
    })

    expect(created.thread.anchor).to.deep.equal(anchor)

    await appendCommentToThread(pathname, {
      threadId: 'thread-margin-1',
      scope: 'margin',
      author: 'assistant',
      body: 'Yes, tighten the image and cadence.'
    })

    const comments = await loadComments(pathname)
    expect(comments).to.have.length(1)
    expect(comments[0].anchor).to.deep.equal(anchor)
    expect(comments[0].comments.map(comment => comment.body)).to.deep.equal([
      'Can you make this sentence sharper?',
      'Yes, tighten the image and cadence.'
    ])
  })

  it('compacts old resolved margin threads while preserving the global thread and active discussions', async function () {
    const pathname = path.join(tempRoot, 'compact-comments.md')

    await saveComments(pathname, [
      {
        id: FLOWRITE_GLOBAL_THREAD_ID,
        scope: 'global',
        status: 'resolved',
        createdAt: '2026-04-09T12:00:00.000Z',
        updatedAt: '2026-04-09T12:00:00.000Z',
        comments: Array.from({ length: 205 }, (_, index) => ({
          id: `global-${index}`,
          author: 'assistant',
          body: `Global comment ${index}`,
          createdAt: `2026-04-09T12:00:${String(index % 60).padStart(2, '0')}.000Z`
        }))
      },
      {
        id: 'active-thread',
        scope: SCOPE_MARGIN,
        status: 'open',
        anchor: createMarginAnchor({
          start: { key: 'ag-para-1', offset: 0 },
          end: { key: 'ag-para-1', offset: 5 },
          quote: 'Draft',
          startBlockText: 'Draft paragraph',
          endBlockText: 'Draft paragraph'
        }),
        createdAt: '2026-04-09T12:00:00.000Z',
        updatedAt: '2026-04-09T12:00:00.000Z',
        comments: [{
          id: 'active-comment',
          author: AUTHOR_ASSISTANT,
          body: 'Keep this active thread.',
          createdAt: '2026-04-09T12:00:00.000Z'
        }]
      },
      ...Array.from({ length: 31 }, (_, index) => ({
        id: `resolved-${index}`,
        scope: SCOPE_MARGIN,
        status: THREAD_STATUS_RESOLVED,
        anchor: createMarginAnchor({
          start: { key: `ag-para-${index}`, offset: 0 },
          end: { key: `ag-para-${index}`, offset: 4 },
          quote: `Quote ${index}`,
          startBlockText: `Paragraph ${index}`,
          endBlockText: `Paragraph ${index}`
        }),
        createdAt: '2026-04-09T12:00:00.000Z',
        updatedAt: index === 0
          ? '2026-02-01T12:00:00.000Z'
          : `2026-04-09T12:${String(index).padStart(2, '0')}:00.000Z`,
        comments: [{
          id: `resolved-comment-${index}`,
          author: AUTHOR_ASSISTANT,
          body: `Resolved comment ${index}`,
          createdAt: '2026-04-09T12:00:00.000Z'
        }]
      }))
    ])

    const comments = await loadComments(pathname)
    const globalThread = comments.find(thread => thread.id === FLOWRITE_GLOBAL_THREAD_ID)
    const activeThread = comments.find(thread => thread.id === 'active-thread')
    const resolvedThreads = comments.filter(thread => thread.status === THREAD_STATUS_RESOLVED && thread.id !== FLOWRITE_GLOBAL_THREAD_ID)

    expect(Boolean(globalThread)).to.equal(true)
    expect(globalThread.comments).to.have.length(200)
    expect(globalThread.comments[0].body).to.equal('Global comment 5')
    expect(Boolean(activeThread)).to.equal(true)
    expect(resolvedThreads).to.have.length(30)
    expect(resolvedThreads.some(thread => thread.id === 'resolved-0')).to.equal(false)
    expect(resolvedThreads.some(thread => thread.id === 'resolved-30')).to.equal(true)
  })

  it('creates at most one snapshot before the first accepted suggestion in a save cycle', async function () {
    const pathname = path.join(tempRoot, 'draft.md')

    const first = await ensureSnapshotForAcceptedSuggestion(pathname, '# Draft\n', {
      saveCycleId: 'cycle-1',
      suggestionId: 'suggestion-a'
    })
    const second = await ensureSnapshotForAcceptedSuggestion(pathname, '# Draft v2\n', {
      saveCycleId: 'cycle-1',
      suggestionId: 'suggestion-b'
    })
    const third = await ensureSnapshotForAcceptedSuggestion(pathname, '# Draft v3\n', {
      saveCycleId: 'cycle-2',
      suggestionId: 'suggestion-c'
    })

    const documentRecord = await loadDocumentRecord(pathname)
    const snapshots = await listSnapshots(pathname)

    expect(first.created).to.equal(true)
    expect(second.created).to.equal(false)
    expect(third.created).to.equal(true)
    expect(snapshots).to.have.length(2)
    expect(documentRecord.lastSnapshotSaveCycleId).to.equal('cycle-2')
  })

  it('migrates the sidecar namespace when a document is renamed or moved in-app', async function () {
    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'renamed.md')

    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])
    await fs.writeFile(oldPath, '# Draft\n', 'utf8')

    await migrateSidecarDirectory(oldPath, newPath)

    expect(await fs.pathExists(getSidecarPaths(oldPath).documentDir)).to.equal(false)
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(true)
    expect(await getCommentBodies(newPath)).to.deep.equal(['Keep me'])
  })

  it('keeps the canonical markdown untouched when sidecar persistence fails', async function () {
    const pathname = path.join(tempRoot, 'atomic.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, 'before\n', 'utf8')

    let error = null
    try {
      await writeMarkdownFile(pathname, 'after\n', markdownOptions, {
        flowrite: {
          comments: { bad: true }
        }
      })
    } catch (err) {
      error = err
    }

    expect(error).to.be.an('error')
    expect(await fs.readFile(pathname, 'utf8')).to.equal('before\n')
    expect(await loadSuggestions(pathname)).to.deep.equal([])
  })

  it('rolls back earlier sidecar writes when a later sidecar write in the same batch fails', async function () {
    const pathname = path.join(tempRoot, 'rollback.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, 'before\n', 'utf8')
    await saveComments(pathname, [{ id: 'comment-1', body: 'Original comment' }])

    let error = null
    try {
      await writeMarkdownFile(pathname, 'after\n', markdownOptions, {
        flowrite: {
          comments: [{ id: 'comment-2', body: 'New comment' }],
          suggestions: { bad: true }
        }
      })
    } catch (err) {
      error = err
    }

    expect(error).to.be.an('error')
    expect(await fs.readFile(pathname, 'utf8')).to.equal('before\n')
    expect(await getCommentBodies(pathname)).to.deep.equal(['Original comment'])
    expect(await loadSuggestions(pathname)).to.deep.equal([])
  })

  it('uses the canonical markdown path for sidecars when saving without an extension', async function () {
    const pathname = path.join(tempRoot, 'no-extension')

    await writeMarkdownFile(pathname, 'after\n', markdownOptions, {
      flowrite: {
        comments: [{ id: 'comment-1', body: 'Canonical path comment' }]
      }
    })

    const canonicalPath = `${pathname}.md`
    expect(await fs.readFile(canonicalPath, 'utf8')).to.equal('after\n')
    expect(await getCommentBodies(canonicalPath)).to.deep.equal(['Canonical path comment'])
    expect(await fs.pathExists(getSidecarPaths(pathname).documentDir)).to.equal(false)
  })

  it('preserves both source and destination when replace-path migration fails', async function () {
    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'renamed.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, 'source\n', 'utf8')
    await fs.writeFile(newPath, 'destination\n', 'utf8')
    await saveComments(oldPath, [{ id: 'source-comment', body: 'Source comment' }])
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (src === getSidecarPaths(oldPath).documentDir && dest === getSidecarPaths(newPath).documentDir) {
        throw new Error('forced sidecar migration failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    expect(error).to.be.an('error')
    expect(await fs.readFile(oldPath, 'utf8')).to.equal('source\n')
    expect(await fs.readFile(newPath, 'utf8')).to.equal('destination\n')
    expect(await getCommentBodies(oldPath)).to.deep.equal(['Source comment'])
    expect(await getCommentBodies(newPath)).to.deep.equal(['Destination comment'])
  })

  it('uses the canonical markdown path for sidecars when moving to a target without an extension', async function () {
    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const extensionlessTarget = path.join(tempRoot, 'archive', 'renamed')
    const canonicalTarget = `${extensionlessTarget}.md`

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, 'source\n', 'utf8')
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    await moveDocumentWithSidecars(oldPath, extensionlessTarget)

    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(canonicalTarget)).to.equal(true)
    expect(await fs.readFile(canonicalTarget, 'utf8')).to.equal('source\n')
    expect(await getCommentBodies(canonicalTarget)).to.deep.equal(['Keep me'])
    expect(await fs.pathExists(getSidecarPaths(extensionlessTarget).documentDir)).to.equal(false)
  })

  it('moves sidebar markdown files through the shared main-process move helper with identity sync', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'sidebar-source.md')
    const newPath = path.join(tempRoot, 'archive', 'sidebar-target')
    const canonicalNewPath = `${newPath}.md`

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-sidebar -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-sidebar',
      lastKnownMarkdownPath: oldPath
    })
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)

    const documentRecord = await loadDocumentRecord(canonicalNewPath)
    const indexEntry = await findDocumentIndexEntry('doc-sidebar')

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: canonicalNewPath,
      pathRemaps: [{
        src: oldPath,
        dest: canonicalNewPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(canonicalNewPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-sidebar')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(canonicalNewPath)
    expect(indexEntry).to.deep.include({
      pathname: canonicalNewPath,
      documentDir: getSidecarPaths(canonicalNewPath).documentDir
    })
    expect(await getCommentBodies(canonicalNewPath)).to.deep.equal(['Keep me'])
  })

  it('moves embedded-comment-only Flowrite markdown files through the shared move helper and creates synced identity state', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'embedded-only.md')
    const newPath = path.join(tempRoot, 'archive', 'embedded-only')
    const canonicalNewPath = `${newPath}.md`

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-embedded-only -->\n\n# Draft\n', 'utf8')

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)

    const documentRecord = await loadDocumentRecord(canonicalNewPath)
    const indexEntry = await findDocumentIndexEntry('doc-embedded-only')

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: canonicalNewPath,
      pathRemaps: [{
        src: oldPath,
        dest: canonicalNewPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(canonicalNewPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-embedded-only')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(canonicalNewPath)
    expect(indexEntry).to.deep.include({
      pathname: canonicalNewPath,
      documentDir: getSidecarPaths(canonicalNewPath).documentDir
    })
  })

  it('moves embedded-only duplicate copies without stealing canonical live index ownership', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'canonical-owner.md')
    const oldPath = path.join(tempRoot, 'docs', 'duplicate-copy.md')
    const newPath = path.join(tempRoot, 'archive', 'duplicate-copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-canonical-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-canonical-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-canonical-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-canonical-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-canonical-owner')
    const movedRecord = await loadDocumentRecord(newPath)

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: newPath,
      pathRemaps: [{
        src: oldPath,
        dest: newPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(await fs.readFile(canonicalPath, 'utf8')).to.equal('<!-- flowrite:id=doc-canonical-owner -->\n\n# Canonical\n')
    expect(movedRecord.documentId).to.equal('doc-canonical-owner')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('moves sidecar-backed duplicate copies without stealing canonical live index ownership', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'sidecar-canonical-owner.md')
    const oldPath = path.join(tempRoot, 'docs', 'sidecar-duplicate-copy.md')
    const newPath = path.join(tempRoot, 'archive', 'sidecar-duplicate-copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-sidecar-canonical-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-sidecar-canonical-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-sidecar-canonical-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-sidecar-canonical-owner',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Copied managed history'
      }]
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-sidecar-canonical-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-sidecar-canonical-owner')
    const movedRecord = await loadDocumentRecord(newPath)

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: newPath,
      pathRemaps: [{
        src: oldPath,
        dest: newPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(movedRecord.documentId).to.equal('doc-sidecar-canonical-owner')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(movedRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Copied managed history'
    }])
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('keeps committed directory moves in place when backup cleanup fails after an embedded-only duplicate move', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'canonical-owner.md')
    const oldDir = path.join(tempRoot, 'duplicate-folder')
    const newDir = path.join(tempRoot, 'duplicate-folder-target')
    const oldPath = path.join(oldDir, 'copy.md')
    const newPath = path.join(newDir, 'copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(newDir)
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-dir-canonical-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-dir-canonical-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-dir-canonical-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-dir-canonical-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced directory backup cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-dir-canonical-owner')
    const movedRecord = await loadDocumentRecord(newPath)

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(movedRecord.documentId).to.equal('doc-dir-canonical-owner')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('moves directories containing sidecar-backed duplicate copies without stealing canonical live index ownership', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'sidecar-folder-canonical-owner.md')
    const oldDir = path.join(tempRoot, 'sidecar-duplicate-folder')
    const newDir = path.join(tempRoot, 'sidecar-duplicate-folder-target')
    const oldPath = path.join(oldDir, 'copy.md')
    const newPath = path.join(newDir, 'copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-sidecar-folder-canonical-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-sidecar-folder-canonical-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-sidecar-folder-canonical-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-sidecar-folder-canonical-owner',
      lastKnownMarkdownPath: oldPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-sidecar-folder-canonical-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir)

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-sidecar-folder-canonical-owner')
    const movedRecord = await loadDocumentRecord(newPath)

    expect(moveResult.src).to.equal(oldDir)
    expect(moveResult.dest).to.equal(newDir)
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(movedRecord.documentId).to.equal('doc-sidecar-folder-canonical-owner')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('keeps committed directory moves in place when backup cleanup fails after a sidecar-backed duplicate move', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'sidecar-dir-rollback-canonical-owner.md')
    const oldDir = path.join(tempRoot, 'sidecar-dir-rollback-source')
    const newDir = path.join(tempRoot, 'sidecar-dir-rollback-target')
    const oldPath = path.join(oldDir, 'copy.md')
    const newPath = path.join(newDir, 'copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(newDir)
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-sidecar-dir-rollback-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-sidecar-dir-rollback-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-sidecar-dir-rollback-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-sidecar-dir-rollback-owner',
      lastKnownMarkdownPath: oldPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-sidecar-dir-rollback-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced sidecar-backed directory rollback failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-sidecar-dir-rollback-owner')
    const movedRecord = await loadDocumentRecord(newPath)

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(movedRecord.documentId).to.equal('doc-sidecar-dir-rollback-owner')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('keeps the completed overwrite when backup cleanup fails after a sidecar-backed duplicate copy move', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'sidecar-rollback-canonical-owner.md')
    const oldPath = path.join(tempRoot, 'docs', 'sidecar-rollback-duplicate.md')
    const newPath = path.join(tempRoot, 'archive', 'sidecar-rollback-duplicate.md')
    const newDocumentDir = getSidecarPaths(newPath).documentDir

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-sidecar-rollback-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-sidecar-rollback-owner -->\n\n# Duplicate\n', 'utf8')
    await fs.writeFile(newPath, 'existing destination\n', 'utf8')
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-sidecar-rollback-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-sidecar-rollback-owner',
      lastKnownMarkdownPath: oldPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-sidecar-rollback-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newDocumentDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced sidecar-backed duplicate rollback failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-sidecar-rollback-owner')
    const movedRecord = await loadDocumentRecord(newPath)

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(movedRecord.documentId).to.equal('doc-sidecar-rollback-owner')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('moves unreadable but already-managed markdown files through the shared move helper and preserves identity state', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'managed-unreadable.md')
    const newPath = path.join(tempRoot, 'archive', 'managed-unreadable.md')
    const originalReadFile = fsPromises.readFile

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '# Unreadable\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-managed-unreadable',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this history'
      }]
    })
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    fsPromises.readFile = async function (pathname, ...rest) {
      if (path.basename(pathname) === 'managed-unreadable.md') {
        throw new Error('forced unreadable managed markdown')
      }
      return originalReadFile.call(this, pathname, ...rest)
    }

    let moveResult = null
    try {
      moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)
    } finally {
      fsPromises.readFile = originalReadFile
    }

    const documentRecord = await loadDocumentRecord(newPath)
    const indexEntry = await findDocumentIndexEntry('doc-managed-unreadable')

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: newPath,
      pathRemaps: [{
        src: oldPath,
        dest: newPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-managed-unreadable')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this history'
    }])
    expect(indexEntry).to.deep.include({
      pathname: newPath,
      documentDir: getSidecarPaths(newPath).documentDir
    })
    expect(await getCommentBodies(newPath)).to.deep.equal(['Keep me'])
  })

  it('moves unreadable legacy sidecar-managed markdown without a documentId and updates lastKnownMarkdownPath', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'legacy-unreadable.md')
    const newPath = path.join(tempRoot, 'archive', 'legacy-unreadable.md')
    const originalReadFile = fsPromises.readFile

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '# Legacy unreadable\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this legacy history'
      }]
    })
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    fsPromises.readFile = async function (pathname, ...rest) {
      if (path.basename(pathname) === 'legacy-unreadable.md') {
        throw new Error('forced unreadable legacy markdown')
      }
      return originalReadFile.call(this, pathname, ...rest)
    }

    let moveResult = null
    try {
      moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)
    } finally {
      fsPromises.readFile = originalReadFile
    }

    const documentRecord = await loadDocumentRecord(newPath)

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: newPath,
      pathRemaps: [{
        src: oldPath,
        dest: newPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this legacy history'
    }])
    expect(await getCommentBodies(newPath)).to.deep.equal(['Keep me'])
  })

  it('does not silently overwrite an existing destination in the shared sidebar move helper', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'collision-source.md')
    const newPath = path.join(tempRoot, 'archive', 'collision-target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-collision -->\n\n# Source\n', 'utf8')
    await fs.writeFile(newPath, 'destination\n', 'utf8')

    let error = null
    try {
      await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)
    } catch (err) {
      error = err
    }

    expect(error).to.be.an('error')
    expect(await fs.pathExists(oldPath)).to.equal(true)
    expect(await fs.readFile(oldPath, 'utf8')).to.equal('<!-- flowrite:id=doc-collision -->\n\n# Source\n')
    expect(await fs.readFile(newPath, 'utf8')).to.equal('destination\n')
    expect(await findDocumentIndexEntry('doc-collision')).to.equal(null)
  })

  it('rejects moving a markdown document onto an existing directory even when overwrite is allowed', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'directory-collision-source.md')
    const newPath = path.join(tempRoot, 'archive', 'directory-collision-target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(newPath)
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-directory-collision -->\n\n# Source\n', 'utf8')

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    }

    expect(error).to.be.an('error')
    expect(error.message).to.equal(`Destination is a directory: ${newPath}`)
    expect(await fs.pathExists(oldPath)).to.equal(true)
    expect((await fs.stat(newPath)).isDirectory()).to.equal(true)
    expect(await findDocumentIndexEntry('doc-directory-collision')).to.equal(null)
  })

  it('cleans stale destination sidecar-only index state in normal shared move helper flows', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'incoming.md')
    const newPath = path.join(tempRoot, 'archive', 'incoming.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, 'incoming\n', 'utf8')
    await saveDocumentRecord(newPath, {
      documentId: 'doc-stale-hidden-destination',
      lastKnownMarkdownPath: newPath
    })
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldPath, newPath)

    expect(moveResult).to.deep.equal({
      src: oldPath,
      dest: newPath,
      pathRemaps: [{
        src: oldPath,
        dest: newPath
      }]
    })
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.readFile(newPath, 'utf8')).to.equal('incoming\n')
    expect(await loadComments(newPath)).to.deep.equal([])
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(false)
    expect(await findDocumentIndexEntry('doc-stale-hidden-destination')).to.equal(null)
  })

  it('moves directories containing Flowrite markdown files through the shared move helper with identity sync', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'docs')
    const newDir = path.join(tempRoot, 'archive', 'docs')
    const oldPath = path.join(oldDir, 'nested', 'sidebar-folder-source.md')
    const newPath = path.join(newDir, 'nested', 'sidebar-folder-source.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-sidebar-folder -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-sidebar-folder',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this history'
      }]
    })
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir)

    const documentRecord = await loadDocumentRecord(newPath)
    const indexEntry = await findDocumentIndexEntry('doc-sidebar-folder')

    expect(moveResult).to.deep.equal({
      src: oldDir,
      dest: newDir,
      pathRemaps: [{
        src: oldPath,
        dest: newPath
      }]
    })
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-sidebar-folder')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this history'
    }])
    expect(indexEntry).to.deep.include({
      pathname: newPath,
      documentDir: getSidecarPaths(newPath).documentDir
    })
    expect(await getCommentBodies(newPath)).to.deep.equal(['Keep me'])
  })

  it('keeps canonical ownership stable when a moved directory contains both the owner and an embedded-only duplicate', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'ownership-source')
    const newDir = path.join(tempRoot, 'ownership-target')
    const ownerOldPath = path.join(oldDir, 'owner.md')
    const duplicateOldPath = path.join(oldDir, 'duplicate.md')
    const ownerNewPath = path.join(newDir, 'owner.md')
    const duplicateNewPath = path.join(newDir, 'duplicate.md')

    await fs.ensureDir(path.dirname(ownerOldPath))
    await fs.writeFile(ownerOldPath, '<!-- flowrite:id=doc-shared-folder-owner -->\n\n# Owner\n', 'utf8')
    await fs.writeFile(duplicateOldPath, '<!-- flowrite:id=doc-shared-folder-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(ownerOldPath, {
      documentId: 'doc-shared-folder-owner',
      lastKnownMarkdownPath: ownerOldPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-shared-folder-owner',
      pathname: ownerOldPath,
      documentDir: getSidecarPaths(ownerOldPath).documentDir
    })

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir)

    const ownerRecord = await loadDocumentRecord(ownerNewPath)
    const duplicateRecord = await loadDocumentRecord(duplicateNewPath)
    const indexEntry = await findDocumentIndexEntry('doc-shared-folder-owner')

    expect(moveResult.src).to.equal(oldDir)
    expect(moveResult.dest).to.equal(newDir)
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(ownerNewPath)).to.equal(true)
    expect(await fs.pathExists(duplicateNewPath)).to.equal(true)
    expect(ownerRecord.documentId).to.equal('doc-shared-folder-owner')
    expect(ownerRecord.lastKnownMarkdownPath).to.equal(ownerNewPath)
    expect(duplicateRecord.documentId).to.equal('doc-shared-folder-owner')
    expect(duplicateRecord.lastKnownMarkdownPath).to.equal(duplicateNewPath)
    expect(indexEntry).to.deep.include({
      pathname: ownerNewPath,
      documentDir: getSidecarPaths(ownerNewPath).documentDir
    })
  })

  it('skips unreadable markdown descendants during directory repair and still moves the folder', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'mixed-source')
    const newDir = path.join(tempRoot, 'mixed-target')
    const managedOldPath = path.join(oldDir, 'nested', 'managed.md')
    const managedNewPath = path.join(newDir, 'nested', 'managed.md')
    const unreadableOldPath = path.join(oldDir, 'nested', 'broken.md')
    const unreadableNewPath = path.join(newDir, 'nested', 'broken.md')
    const originalReadFile = fsPromises.readFile

    await fs.ensureDir(path.dirname(managedOldPath))
    await fs.writeFile(managedOldPath, '<!-- flowrite:id=doc-readable -->\n\n# Draft\n', 'utf8')
    await fs.writeFile(unreadableOldPath, '# Broken\n', 'utf8')
    await saveDocumentRecord(managedOldPath, {
      documentId: 'doc-readable',
      lastKnownMarkdownPath: managedOldPath
    })

    fsPromises.readFile = async function (pathname, ...rest) {
      if (path.resolve(pathname) === path.resolve(unreadableOldPath)) {
        throw new Error('forced unreadable markdown')
      }
      return originalReadFile.call(this, pathname, ...rest)
    }

    let moveResult = null
    try {
      moveResult = await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir)
    } finally {
      fsPromises.readFile = originalReadFile
    }

    const documentRecord = await loadDocumentRecord(managedNewPath)
    const indexEntry = await findDocumentIndexEntry('doc-readable')

    expect(moveResult.src).to.equal(oldDir)
    expect(moveResult.dest).to.equal(newDir)
    expect(moveResult.pathRemaps).to.have.deep.members([{
      src: managedOldPath,
      dest: managedNewPath
    }, {
      src: unreadableOldPath,
      dest: unreadableNewPath
    }])
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(managedNewPath)).to.equal(true)
    expect(await fs.pathExists(unreadableNewPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-readable')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(managedNewPath)
    expect(indexEntry).to.deep.include({
      pathname: managedNewPath,
      documentDir: getSidecarPaths(managedNewPath).documentDir
    })
  })

  it('rolls back directory moves that fail while repairing contained Flowrite markdown identities', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'folder-source')
    const newDir = path.join(tempRoot, 'folder-target')
    const oldPath = path.join(oldDir, 'nested', 'rollback.md')
    const newPath = path.join(newDir, 'nested', 'rollback.md')
    const oldSidecarDir = getSidecarPaths(oldPath).documentDir
    const indexPath = path.join(tempRoot, 'flowrite', 'document-index.json')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-folder-rollback -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-folder-rollback',
      lastKnownMarkdownPath: oldPath
    })
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (dest === indexPath) {
        throw new Error('forced directory identity repair failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir)
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const documentRecord = await loadDocumentRecord(oldPath)
    const indexEntry = await findDocumentIndexEntry('doc-folder-rollback')

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced directory identity repair failure')
    expect(await fs.pathExists(oldDir)).to.equal(true)
    expect(await fs.pathExists(newDir)).to.equal(false)
    expect(await fs.pathExists(oldPath)).to.equal(true)
    expect(await fs.pathExists(oldSidecarDir)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-folder-rollback')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(oldPath)
    expect(indexEntry).to.deep.include({
      pathname: oldPath,
      documentDir: oldSidecarDir
    })
    expect(await getCommentBodies(oldPath)).to.deep.equal(['Keep me'])
    expect(await fs.pathExists(newPath)).to.equal(false)
  })

  it('removes stale index state when rolling back a directory move that touched an embedded-comment-only Flowrite file', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'embedded-folder-source')
    const newDir = path.join(tempRoot, 'embedded-folder-target')
    const firstOldPath = path.join(oldDir, 'nested', 'embedded-rollback-a.md')
    const firstNewPath = path.join(newDir, 'nested', 'embedded-rollback-a.md')
    const secondOldPath = path.join(oldDir, 'nested', 'embedded-rollback-b.md')
    const firstNewDocumentDir = getSidecarPaths(firstNewPath).documentDir
    const indexPath = path.join(tempRoot, 'flowrite', 'document-index.json')

    await fs.ensureDir(path.dirname(firstOldPath))
    await fs.writeFile(firstOldPath, '<!-- flowrite:id=doc-embedded-rollback-a -->\n\n# Draft A\n', 'utf8')
    await fs.writeFile(secondOldPath, '<!-- flowrite:id=doc-embedded-rollback-b -->\n\n# Draft B\n', 'utf8')

    const originalMove = fs.move
    let indexWriteCount = 0
    fs.move = async function (src, dest, options) {
      if (dest === indexPath) {
        indexWriteCount += 1
        if (indexWriteCount === 2) {
          throw new Error('forced embedded rollback failure')
        }
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir)
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const firstIndexEntry = await findDocumentIndexEntry('doc-embedded-rollback-a')
    const secondIndexEntry = await findDocumentIndexEntry('doc-embedded-rollback-b')
    const firstOldDocumentRecord = await loadDocumentRecord(firstOldPath)
    const secondOldDocumentRecord = await loadDocumentRecord(secondOldPath)

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced embedded rollback failure')
    expect(await fs.pathExists(oldDir)).to.equal(true)
    expect(await fs.pathExists(newDir)).to.equal(false)
    expect(await fs.pathExists(firstOldPath)).to.equal(true)
    expect(await fs.pathExists(secondOldPath)).to.equal(true)
    expect(await fs.pathExists(firstNewDocumentDir)).to.equal(false)
    expect(firstIndexEntry).to.equal(null)
    expect(secondIndexEntry).to.equal(null)
    expect(firstOldDocumentRecord.documentId).to.equal('')
    expect(firstOldDocumentRecord.lastKnownMarkdownPath).to.equal('')
    expect(secondOldDocumentRecord.documentId).to.equal('')
    expect(secondOldDocumentRecord.lastKnownMarkdownPath).to.equal('')
  })

  it('rolls back sidecars when the final markdown commit move fails', async function () {
    const pathname = path.join(tempRoot, 'commit-failure.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, 'before\n', 'utf8')
    await saveComments(pathname, [{ id: 'comment-1', body: 'Original comment' }])

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (
        dest === pathname &&
        path.basename(src).startsWith(`.${path.basename(pathname)}.`) &&
        path.basename(src).endsWith('.tmp')
      ) {
        throw new Error('forced markdown commit failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await writeMarkdownFile(pathname, 'after\n', markdownOptions, {
        flowrite: {
          comments: [{ id: 'comment-2', body: 'New comment' }]
        }
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    expect(error).to.be.an('error')
    expect(await fs.readFile(pathname, 'utf8')).to.equal('before\n')
    expect(await getCommentBodies(pathname)).to.deep.equal(['Original comment'])
  })

  it('restores the canonical live index owner when atomic save rollback fails for an embedded-only duplicate copy', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'canonical-save-owner.md')
    const duplicatePath = path.join(tempRoot, 'archive', 'duplicate-save-copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(duplicatePath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-save-canonical-owner -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(duplicatePath, '<!-- flowrite:id=doc-save-canonical-owner -->\n\n# Duplicate\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-save-canonical-owner',
      lastKnownMarkdownPath: canonicalPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-save-canonical-owner',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (
        dest === duplicatePath &&
        path.basename(src).startsWith(`.${path.basename(duplicatePath)}.`) &&
        path.basename(src).endsWith('.tmp')
      ) {
        throw new Error('forced duplicate markdown commit failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await writeMarkdownFile(duplicatePath, '# Edited duplicate\n', markdownOptions, {
        flowrite: {
          document: {
            documentId: 'doc-save-canonical-owner'
          }
        }
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-save-canonical-owner')

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced duplicate markdown commit failure')
    expect(await fs.readFile(duplicatePath, 'utf8')).to.equal('<!-- flowrite:id=doc-save-canonical-owner -->\n\n# Duplicate\n')
    expect(await fs.pathExists(getSidecarPaths(duplicatePath).documentDir)).to.equal(false)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('preserves the canonical live index owner when atomic save rollback fails for an unreadable embedded-only duplicate copy', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'canonical-save-owner-unreadable.md')
    const duplicatePath = path.join(tempRoot, 'archive', 'duplicate-save-copy-unreadable.md')
    const originalReadFile = fsPromises.readFile
    const originalMove = fs.move

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(duplicatePath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-save-canonical-owner-unreadable -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(duplicatePath, '<!-- flowrite:id=doc-save-canonical-owner-unreadable -->\n\n# Duplicate unreadable\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-save-canonical-owner-unreadable',
      lastKnownMarkdownPath: canonicalPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-save-canonical-owner-unreadable',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    fsPromises.readFile = async function (pathname, ...rest) {
      if (path.resolve(pathname) === path.resolve(duplicatePath)) {
        throw new Error('forced unreadable duplicate markdown')
      }
      return originalReadFile.call(this, pathname, ...rest)
    }

    fs.move = async function (src, dest, options) {
      if (
        dest === duplicatePath &&
        path.basename(src).startsWith(`.${path.basename(duplicatePath)}.`) &&
        path.basename(src).endsWith('.tmp')
      ) {
        throw new Error('forced unreadable duplicate markdown commit failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await writeMarkdownFile(duplicatePath, '# Edited unreadable duplicate\n', markdownOptions, {
        flowrite: {
          document: {
            documentId: 'doc-save-canonical-owner-unreadable'
          }
        }
      })
    } catch (err) {
      error = err
    } finally {
      fsPromises.readFile = originalReadFile
      fs.move = originalMove
    }

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-save-canonical-owner-unreadable')

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced unreadable duplicate markdown commit failure')
    expect(await fs.readFile(duplicatePath, 'utf8')).to.equal('<!-- flowrite:id=doc-save-canonical-owner-unreadable -->\n\n# Duplicate unreadable\n')
    expect(await fs.pathExists(getSidecarPaths(duplicatePath).documentDir)).to.equal(false)
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('restores document identity to the old path when a single-file move fails after sync completes', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'post-sync-source.md')
    const newPath = path.join(tempRoot, 'archive', 'post-sync-target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-post-sync -->\n\n# Draft\n', 'utf8')
    await fs.writeFile(newPath, 'destination\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-post-sync',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this history'
      }]
    })

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newPath) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced markdown backup cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const documentRecord = await loadDocumentRecord(newPath)
    const indexEntry = await findDocumentIndexEntry('doc-post-sync')

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-post-sync')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this history'
    }])
    expect(indexEntry).to.deep.include({
      pathname: newPath,
      documentDir: getSidecarPaths(newPath).documentDir
    })
  })

  it('keeps the overwrite result when overwritten destination backup cleanup fails after sync', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'overwrite-source.md')
    const newPath = path.join(tempRoot, 'archive', 'overwrite-target.md')
    const oldMarkdown = '<!-- flowrite:id=doc-overwrite-source -->\n\n# Source\n'
    const newMarkdown = '<!-- flowrite:id=doc-overwrite-destination -->\n\n# Destination\n'
    const newDocumentDir = getSidecarPaths(newPath).documentDir

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, oldMarkdown, 'utf8')
    await fs.writeFile(newPath, newMarkdown, 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-overwrite-source',
      lastKnownMarkdownPath: oldPath
    })
    await saveComments(oldPath, [{ id: 'source-comment', body: 'Source comment' }])
    await saveDocumentRecord(newPath, {
      documentId: 'doc-overwrite-destination',
      lastKnownMarkdownPath: newPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Destination history'
      }]
    })
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newDocumentDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced overwritten destination backup cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const movedRecord = await loadDocumentRecord(newPath)
    const sourceIndexEntry = await findDocumentIndexEntry('doc-overwrite-source')
    const destinationIndexEntry = await findDocumentIndexEntry('doc-overwrite-destination')

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.readFile(newPath, 'utf8')).to.equal(oldMarkdown)
    expect(await getCommentBodies(newPath)).to.deep.equal(['Source comment'])
    expect(movedRecord.documentId).to.equal('doc-overwrite-source')
    expect(movedRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(sourceIndexEntry).to.deep.include({
      pathname: newPath,
      documentDir: getSidecarPaths(newPath).documentDir
    })
    expect(destinationIndexEntry).to.equal(null)
  })

  it('removes replaced destination sidecars and stale index entries when the source document has none', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'source.md')
    const newPath = path.join(tempRoot, 'archive', 'target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, 'source\n', 'utf8')
    await fs.writeFile(newPath, '<!-- flowrite:id=doc-overwritten-destination -->\n\ndestination\n', 'utf8')
    await saveDocumentRecord(newPath, {
      documentId: 'doc-overwritten-destination',
      lastKnownMarkdownPath: newPath
    })
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    await moveDocumentWithSidecars(oldPath, newPath, {
      allowOverwrite: true
    })

    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.readFile(newPath, 'utf8')).to.equal('source\n')
    expect(await loadComments(newPath)).to.deep.equal([])
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(false)
    expect(await findDocumentIndexEntry('doc-overwritten-destination')).to.equal(null)
  })

  it('does not delete the canonical live index entry when overwriting a duplicate-copy destination', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'canonical.md')
    const oldPath = path.join(tempRoot, 'docs', 'replacement-source.md')
    const newPath = path.join(tempRoot, 'archive', 'duplicate-copy.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-canonical-live -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(oldPath, 'replacement\n', 'utf8')
    await fs.writeFile(newPath, '<!-- flowrite:id=doc-canonical-live -->\n\n# Duplicate copy\n', 'utf8')
    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-canonical-live',
      lastKnownMarkdownPath: canonicalPath
    })
    await saveDocumentRecord(newPath, {
      documentId: 'doc-canonical-live',
      lastKnownMarkdownPath: canonicalPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-canonical-live',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    await moveDocumentWithSidecars(oldPath, newPath, {
      allowOverwrite: true
    })

    const canonicalIndexEntry = await findDocumentIndexEntry('doc-canonical-live')

    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.readFile(newPath, 'utf8')).to.equal('replacement\n')
    expect(await fs.readFile(canonicalPath, 'utf8')).to.equal('<!-- flowrite:id=doc-canonical-live -->\n\n# Canonical\n')
    expect(canonicalIndexEntry).to.deep.include({
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })
  })

  it('removes stale sidecar-only destination index entries after overwrite success', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'stale-sidecar-source.md')
    const newPath = path.join(tempRoot, 'archive', 'stale-sidecar-target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, 'source\n', 'utf8')
    await saveDocumentRecord(newPath, {
      documentId: 'doc-stale-sidecar-destination',
      lastKnownMarkdownPath: newPath
    })
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    await moveDocumentWithSidecars(oldPath, newPath, {
      allowOverwrite: true
    })

    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.readFile(newPath, 'utf8')).to.equal('source\n')
    expect(await loadComments(newPath)).to.deep.equal([])
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(false)
    expect(await findDocumentIndexEntry('doc-stale-sidecar-destination')).to.equal(null)
  })

  it('keeps the overwrite result when stale sidecar destination backup cleanup fails after sync', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'stale-sidecar-rollback-source.md')
    const newPath = path.join(tempRoot, 'archive', 'stale-sidecar-rollback-target.md')
    const newDocumentDir = getSidecarPaths(newPath).documentDir

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-stale-sidecar-source -->\n\n# Source\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-stale-sidecar-source',
      lastKnownMarkdownPath: oldPath
    })
    await saveDocumentRecord(newPath, {
      documentId: 'doc-stale-sidecar-destination-rollback',
      lastKnownMarkdownPath: newPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Restore me'
      }]
    })
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newDocumentDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced stale sidecar backup cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const sourceRecord = await loadDocumentRecord(oldPath)
    const destinationRecord = await loadDocumentRecord(newPath)
    const sourceIndexEntry = await findDocumentIndexEntry('doc-stale-sidecar-source')
    const destinationIndexEntry = await findDocumentIndexEntry('doc-stale-sidecar-destination-rollback')

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(sourceRecord.documentId).to.equal('')
    expect(sourceRecord.lastKnownMarkdownPath).to.equal('')
    expect(sourceIndexEntry).to.deep.include({
      pathname: newPath,
      documentDir: getSidecarPaths(newPath).documentDir
    })
    expect(destinationRecord.documentId).to.equal('doc-stale-sidecar-source')
    expect(destinationRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(destinationIndexEntry).to.equal(null)
    expect(await getCommentBodies(newPath)).to.deep.equal([])
  })

  it('removes stale sidecar-only destination index entries after directory overwrite success', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'source-dir')
    const newDir = path.join(tempRoot, 'target-dir')
    const oldPath = path.join(oldDir, 'nested', 'incoming.md')
    const newStalePath = path.join(newDir, 'nested', 'stale.md')
    const newIncomingPath = path.join(newDir, 'nested', 'incoming.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newStalePath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-dir-source -->\n\n# Source\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-dir-source',
      lastKnownMarkdownPath: oldPath
    })
    await saveDocumentRecord(newStalePath, {
      documentId: 'doc-dir-stale-destination',
      lastKnownMarkdownPath: newStalePath
    })

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir, {
      allowOverwrite: true
    })

    const incomingRecord = await loadDocumentRecord(newIncomingPath)
    const sourceIndexEntry = await findDocumentIndexEntry('doc-dir-source')
    const staleIndexEntry = await findDocumentIndexEntry('doc-dir-stale-destination')

    expect(moveResult.src).to.equal(oldDir)
    expect(moveResult.dest).to.equal(newDir)
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(newIncomingPath)).to.equal(true)
    expect(incomingRecord.documentId).to.equal('doc-dir-source')
    expect(incomingRecord.lastKnownMarkdownPath).to.equal(newIncomingPath)
    expect(sourceIndexEntry).to.deep.include({
      pathname: newIncomingPath,
      documentDir: getSidecarPaths(newIncomingPath).documentDir
    })
    expect(staleIndexEntry).to.equal(null)
  })

  it('removes overwritten live destination document index entries after managed directory overwrite success', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'managed-source-dir')
    const newDir = path.join(tempRoot, 'managed-target-dir')
    const sourceOldPath = path.join(oldDir, 'incoming.md')
    const sourceNewPath = path.join(newDir, 'incoming.md')
    const destinationOldPath = path.join(newDir, 'existing.md')

    await fs.ensureDir(path.dirname(sourceOldPath))
    await fs.ensureDir(path.dirname(destinationOldPath))
    await fs.writeFile(sourceOldPath, '<!-- flowrite:id=doc-managed-source-overwrite -->\n\n# Source\n', 'utf8')
    await saveDocumentRecord(sourceOldPath, {
      documentId: 'doc-managed-source-overwrite',
      lastKnownMarkdownPath: sourceOldPath
    })
    await fs.writeFile(destinationOldPath, '<!-- flowrite:id=doc-managed-destination-overwrite -->\n\n# Destination\n', 'utf8')
    await saveDocumentRecord(destinationOldPath, {
      documentId: 'doc-managed-destination-overwrite',
      lastKnownMarkdownPath: destinationOldPath
    })

    const moveResult = await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir, {
      allowOverwrite: true
    })

    const sourceIndexEntry = await findDocumentIndexEntry('doc-managed-source-overwrite')
    const destinationIndexEntry = await findDocumentIndexEntry('doc-managed-destination-overwrite')
    const sourceRecord = await loadDocumentRecord(sourceNewPath)

    expect(moveResult.src).to.equal(oldDir)
    expect(moveResult.dest).to.equal(newDir)
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(sourceNewPath)).to.equal(true)
    expect(sourceRecord.documentId).to.equal('doc-managed-source-overwrite')
    expect(sourceRecord.lastKnownMarkdownPath).to.equal(sourceNewPath)
    expect(sourceIndexEntry).to.deep.include({
      pathname: sourceNewPath,
      documentDir: getSidecarPaths(sourceNewPath).documentDir
    })
    expect(destinationIndexEntry).to.equal(null)
  })

  it('keeps no-managed directory overwrites committed when cleanup fails after commit', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldDir = path.join(tempRoot, 'plain-source-dir')
    const newDir = path.join(tempRoot, 'plain-target-dir')
    const oldPlainPath = path.join(oldDir, 'plain.txt')
    const staleManagedPath = path.join(newDir, 'stale.md')

    await fs.ensureDir(path.dirname(oldPlainPath))
    await fs.ensureDir(path.dirname(staleManagedPath))
    await fs.writeFile(oldPlainPath, 'plain\n', 'utf8')
    await saveDocumentRecord(staleManagedPath, {
      documentId: 'doc-no-managed-stale-destination',
      lastKnownMarkdownPath: staleManagedPath
    })

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(newDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced plain directory cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await moveFileSystemItemWithFlowriteIdentity(oldDir, newDir, {
        allowOverwrite: true
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const staleIndexEntry = await findDocumentIndexEntry('doc-no-managed-stale-destination')

    expect(error).to.equal(null)
    expect(await fs.pathExists(oldDir)).to.equal(false)
    expect(await fs.pathExists(newDir)).to.equal(true)
    expect(staleIndexEntry).to.equal(null)
  })

  it('keeps committed markdown and sidecars when sidecar backup cleanup fails after markdown commit', async function () {
    const pathname = path.join(tempRoot, 'post-commit-cleanup.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, 'before\n', 'utf8')
    await saveComments(pathname, [{ id: 'comment-1', body: 'Original comment' }])

    const documentDir = getSidecarPaths(pathname).documentDir
    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (typeof targetPath === 'string' && path.dirname(targetPath) === path.dirname(documentDir) && path.basename(targetPath).includes('.bak')) {
        throw new Error('forced sidecar cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await writeMarkdownFile(pathname, 'after\n', markdownOptions, {
        flowrite: {
          comments: [{ id: 'comment-2', body: 'New comment' }]
        }
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    expect(error).to.equal(null)
    expect(await fs.readFile(pathname, 'utf8')).to.equal('after\n')
    expect(await getCommentBodies(pathname)).to.deep.equal(['New comment'])
  })

  it('strips the flowrite id comment before the markdown reaches editor state', async function () {
    const pathname = path.join(tempRoot, 'identity-load.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')

    const rawDocument = await loadMarkdownFile(pathname, 'lf', true, 2)

    expect(rawDocument.markdown).to.equal('# Draft\n')
    expect(rawDocument.flowriteDocumentId).to.equal('doc-123')
    expect(rawDocument.flowriteDocumentIdCarrier).to.equal('html_comment')
  })

  it('re-injects the flowrite id comment during save when saveContext carries documentId', async function () {
    const pathname = path.join(tempRoot, 'identity-save.md')

    await writeMarkdownFile(pathname, '# Draft\n', markdownOptions, {
      flowrite: {
        document: {
          documentId: 'doc-123'
        }
      }
    })

    expect(await fs.readFile(pathname, 'utf8')).to.equal('<!-- flowrite:id=doc-123 -->\n\n# Draft\n')
  })

  it('re-injects the flowrite id comment using CRLF when the target line ending is crlf', async function () {
    const pathname = path.join(tempRoot, 'identity-save-crlf.md')

    await writeMarkdownFile(pathname, '# Draft\n', {
      ...markdownOptions,
      adjustLineEndingOnSave: true,
      lineEnding: 'crlf'
    }, {
      flowrite: {
        document: {
          documentId: 'doc-123'
        }
      }
    })

    expect(await fs.readFile(pathname, 'utf8')).to.equal('<!-- flowrite:id=doc-123 -->\r\n\r\n# Draft\r\n')
  })

  it('writes matching markdown comment, document.json documentId, and document index entry in one atomic identity save', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'identity-save-atomic.md')

    await writeMarkdownFile(pathname, '# Draft\n', markdownOptions, {
      flowrite: {
        document: {
          documentId: 'doc-123'
        }
      }
    })

    const documentRecord = await loadDocumentRecord(pathname)
    const indexEntry = await findDocumentIndexEntry('doc-123')

    expect(await fs.readFile(pathname, 'utf8')).to.equal('<!-- flowrite:id=doc-123 -->\n\n# Draft\n')
    expect(documentRecord.documentId).to.equal('doc-123')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(pathname)
    expect(indexEntry).to.deep.include({
      pathname,
      documentDir: getSidecarPaths(pathname).documentDir
    })
  })

  it('persists documentId in document.json', async function () {
    const pathname = path.join(tempRoot, 'identity-record.md')

    await saveDocumentRecord(pathname, {
      documentId: 'doc-123'
    })

    const documentRecord = await loadDocumentRecord(pathname)
    expect(documentRecord.documentId).to.equal('doc-123')
  })

  it('records the last known path for a document id in the global index', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    await rememberDocumentIndexEntry({
      documentId: 'doc-123',
      pathname: '/tmp/draft.md',
      documentDir: '/tmp/.flowrite/draft-aaaa1111'
    })

    const entry = await findDocumentIndexEntry('doc-123')
    expect(entry.pathname).to.equal('/tmp/draft.md')
  })

  it('preserves both document index entries when in-process writes overlap', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const indexPath = path.join(tempRoot, 'flowrite', 'document-index.json')
    const originalMove = fs.move
    let releaseFirstMove
    let firstMoveStartedResolve
    const firstMoveStarted = new Promise(resolve => {
      firstMoveStartedResolve = resolve
    })
    let delayedFirstMove = false

    fs.move = async function (src, dest, options) {
      if (!delayedFirstMove && dest === indexPath) {
        delayedFirstMove = true
        firstMoveStartedResolve()
        await new Promise(resolve => {
          releaseFirstMove = resolve
        })
      }
      return originalMove.call(this, src, dest, options)
    }

    try {
      const firstWrite = rememberDocumentIndexEntry({
        documentId: 'doc-123',
        pathname: '/tmp/first.md',
        documentDir: '/tmp/.flowrite/first-aaaa1111'
      })

      await firstMoveStarted

      const secondWrite = rememberDocumentIndexEntry({
        documentId: 'doc-456',
        pathname: '/tmp/second.md',
        documentDir: '/tmp/.flowrite/second-bbbb2222'
      })

      releaseFirstMove()
      await Promise.all([firstWrite, secondWrite])
    } finally {
      fs.move = originalMove
    }

    const firstEntry = await findDocumentIndexEntry('doc-123')
    const secondEntry = await findDocumentIndexEntry('doc-456')

    expect(firstEntry.pathname).to.equal('/tmp/first.md')
    expect(secondEntry.pathname).to.equal('/tmp/second.md')
  })

  it('rolls back document.json when document index persistence fails', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'identity-record-rollback.md')
    const indexPath = path.join(tempRoot, 'flowrite', 'document-index.json')

    await saveDocumentRecord(pathname, {
      documentId: 'doc-old'
    })

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (dest === indexPath) {
        throw new Error('forced document index failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await saveDocumentRecord(pathname, {
        documentId: 'doc-new'
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const documentRecord = await loadDocumentRecord(pathname)
    const oldEntry = await findDocumentIndexEntry('doc-old')
    const newEntry = await findDocumentIndexEntry('doc-new')

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced document index failure')
    expect(documentRecord.documentId).to.equal('doc-old')
    expect(oldEntry.pathname).to.equal(pathname)
    expect(newEntry).to.equal(null)
  })

  it('keeps persisted document.json and only the current index entry when backup cleanup fails after commit', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'identity-record-cleanup.md')
    const documentFile = getSidecarPaths(pathname).documentFile

    await saveDocumentRecord(pathname, {
      documentId: 'doc-old'
    })

    const originalRemove = fs.remove
    fs.remove = async function (targetPath, ...rest) {
      if (
        typeof targetPath === 'string' &&
        path.dirname(targetPath) === path.dirname(documentFile) &&
        path.basename(targetPath).includes('.bak')
      ) {
        throw new Error('forced backup cleanup failure')
      }
      return originalRemove.call(this, targetPath, ...rest)
    }

    let error = null
    try {
      await saveDocumentRecord(pathname, {
        documentId: 'doc-new'
      })
    } catch (err) {
      error = err
    } finally {
      fs.remove = originalRemove
    }

    const documentRecord = await loadDocumentRecord(pathname)
    const oldEntry = await findDocumentIndexEntry('doc-old')
    const newEntry = await findDocumentIndexEntry('doc-new')

    expect(error).to.equal(null)
    expect(documentRecord.documentId).to.equal('doc-new')
    expect(oldEntry).to.equal(null)
    expect(newEntry.pathname).to.equal(pathname)
  })

  it('preserves unrelated persisted document fields during partial document saves', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'identity-record-partial.md')
    await saveDocumentRecord(pathname, {
      documentId: 'doc-old',
      lastKnownMarkdownPath: pathname,
      lastSnapshotSaveCycleId: 'cycle-1',
      conversationHistory: [{
        role: 'assistant',
        text: 'Keep this history'
      }],
      historyTokenEstimate: 123
    })

    await saveDocumentRecord(pathname, {
      documentId: 'doc-new'
    })

    const documentRecord = await loadDocumentRecord(pathname)
    const oldEntry = await findDocumentIndexEntry('doc-old')
    const newEntry = await findDocumentIndexEntry('doc-new')

    expect(documentRecord.documentId).to.equal('doc-new')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(pathname)
    expect(documentRecord.lastSnapshotSaveCycleId).to.equal('cycle-1')
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this history'
    }])
    expect(documentRecord.historyTokenEstimate).to.equal(123)
    expect(oldEntry).to.equal(null)
    expect(newEntry.pathname).to.equal(pathname)
  })

  it('rolls back markdown, document.json, and document index together when atomic identity save fails at markdown commit', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'identity-save-rollback.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, '<!-- flowrite:id=doc-old -->\n\nbefore\n', 'utf8')
    await saveDocumentRecord(pathname, {
      documentId: 'doc-old',
      lastKnownMarkdownPath: pathname
    })

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (
        dest === pathname &&
        path.basename(src).startsWith(`.${path.basename(pathname)}.`) &&
        path.basename(src).endsWith('.tmp')
      ) {
        throw new Error('forced markdown commit failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await writeMarkdownFile(pathname, 'after\n', markdownOptions, {
        flowrite: {
          document: {
            documentId: 'doc-new'
          }
        }
      })
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const documentRecord = await loadDocumentRecord(pathname)
    const oldEntry = await findDocumentIndexEntry('doc-old')
    const newEntry = await findDocumentIndexEntry('doc-new')

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced markdown commit failure')
    expect(await fs.readFile(pathname, 'utf8')).to.equal('<!-- flowrite:id=doc-old -->\n\nbefore\n')
    expect(documentRecord.documentId).to.equal('doc-old')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(pathname)
    expect(oldEntry).to.deep.include({
      pathname,
      documentDir: getSidecarPaths(pathname).documentDir
    })
    expect(newEntry).to.equal(null)
  })

  it('relinks a moved markdown file to the old sidecar when documentId matches the recovery index', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'draft.md')
    const oldSidecarDir = getSidecarPaths(oldPath).documentDir
    const newSidecarDir = getSidecarPaths(newPath).documentDir

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
      documentDir: oldSidecarDir
    })

    await fs.move(oldPath, newPath)

    const identity = await ensureDocumentIdentityForPath(newPath, {
      resolveDuplicateDocumentChoice () {
        throw new Error('copy prompt should not run for true moves')
      }
    })
    const comments = await loadComments(newPath)
    const documentRecord = await loadDocumentRecord(newPath)
    const indexEntry = await findDocumentIndexEntry('doc-123')

    expect(identity).to.deep.equal({
      documentId: 'doc-123',
      pathname: newPath
    })
    expect(comments).to.have.length(1)
    expect(comments[0].comments[0].body).to.equal('Keep me')
    expect(await fs.pathExists(oldSidecarDir)).to.equal(false)
    expect(await fs.pathExists(newSidecarDir)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-123')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(indexEntry.pathname).to.equal(newPath)
    expect(indexEntry.documentDir).to.equal(newSidecarDir)
  })

  it('updates the document index and lastKnownMarkdownPath when the file is renamed in-app', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'rename-source.md')
    const newPath = path.join(tempRoot, 'archive', 'rename-target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-rename -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-rename',
      lastKnownMarkdownPath: oldPath
    })
    await rememberDocumentIndexEntry({
      documentId: 'doc-rename',
      pathname: oldPath,
      documentDir: getSidecarPaths(oldPath).documentDir
    })

    await moveDocumentWithSidecars(oldPath, newPath)

    const documentRecord = await loadDocumentRecord(newPath)
    const indexEntry = await findDocumentIndexEntry('doc-rename')

    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.pathExists(newPath)).to.equal(true)
    expect(documentRecord.documentId).to.equal('doc-rename')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(indexEntry).to.deep.include({
      pathname: newPath,
      documentDir: getSidecarPaths(newPath).documentDir
    })
  })

  it('rolls back the document index and lastKnownMarkdownPath when in-app rename persistence fails', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'rename-rollback-source.md')
    const newPath = path.join(tempRoot, 'archive', 'rename-rollback-target.md')
    const oldSidecarDir = getSidecarPaths(oldPath).documentDir
    const newSidecarDir = getSidecarPaths(newPath).documentDir
    const indexPath = path.join(tempRoot, 'flowrite', 'document-index.json')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-rename-rollback -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-rename-rollback',
      lastKnownMarkdownPath: oldPath
    })
    await saveComments(oldPath, [{ id: 'comment-1', body: 'Keep me' }])

    const originalMove = fs.move
    fs.move = async function (src, dest, options) {
      if (dest === indexPath) {
        throw new Error('forced rename index failure')
      }
      return originalMove.call(this, src, dest, options)
    }

    let error = null
    try {
      await moveDocumentWithSidecars(oldPath, newPath)
    } catch (err) {
      error = err
    } finally {
      fs.move = originalMove
    }

    const documentRecord = await loadDocumentRecord(oldPath)
    const indexEntry = await findDocumentIndexEntry('doc-rename-rollback')

    expect(error).to.be.an('error')
    expect(error.message).to.equal('forced rename index failure')
    expect(await fs.pathExists(oldPath)).to.equal(true)
    expect(await fs.pathExists(newPath)).to.equal(false)
    expect(await fs.pathExists(oldSidecarDir)).to.equal(true)
    expect(await fs.pathExists(newSidecarDir)).to.equal(false)
    expect(documentRecord.lastKnownMarkdownPath).to.equal(oldPath)
    expect(indexEntry).to.deep.include({
      pathname: oldPath,
      documentDir: oldSidecarDir
    })
    expect(await getCommentBodies(oldPath)).to.deep.equal(['Keep me'])
  })

  it('writes a generated documentId into markdown during bootstrap-time identity repair for legacy files', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'legacy-bootstrap.md')
    await fs.ensureDir(path.dirname(pathname))
    await fs.writeFile(pathname, '# Draft\n', 'utf8')

    const identity = await ensureDocumentIdentityForPath(pathname)
    const documentRecord = await loadDocumentRecord(pathname)
    const markdown = await fs.readFile(pathname, 'utf8')

    expect(identity.documentId).to.match(/^[0-9a-f-]{36}$/)
    expect(documentRecord.documentId).to.equal(identity.documentId)
    expect(markdown).to.equal(`<!-- flowrite:id=${identity.documentId} -->\n\n# Draft\n`)
  })

  it('writes the embedded documentId marker for an existing sidecar-backed legacy document during bootstrap repair', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const pathname = path.join(tempRoot, 'existing-sidecar-legacy.md')
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

    const identity = await ensureDocumentIdentityForPath(pathname)
    const documentRecord = await loadDocumentRecord(pathname)
    const markdown = await fs.readFile(pathname, 'utf8')

    expect(identity.documentId).to.equal('doc-existing')
    expect(documentRecord.documentId).to.equal('doc-existing')
    expect(documentRecord.lastKnownMarkdownPath).to.equal(pathname)
    expect(documentRecord.conversationHistory).to.deep.equal([{
      role: 'assistant',
      text: 'Keep this history'
    }])
    expect(markdown).to.equal('<!-- flowrite:id=doc-existing -->\n\n# Draft\n')
  })

  it('prompts for copy/fork when the current sidecar lastKnownMarkdownPath still points to an existing original file', async function () {
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
        text: 'Original history'
      }]
    })
    await saveComments(oldPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
      comments: [{
        id: 'comment-old',
        author: 'assistant',
        body: 'Original comment',
        createdAt: '2026-04-16T10:00:00.000Z'
      }]
    }])

    // Simulate a duplicated sidecar that already agrees with the copied markdown.
    await saveDocumentRecord(newPath, {
      documentId: 'doc-123',
      lastKnownMarkdownPath: oldPath,
      conversationHistory: [{
        role: 'assistant',
        text: 'Duplicated history'
      }]
    })
    await saveComments(newPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T11:00:00.000Z',
      updatedAt: '2026-04-16T11:00:00.000Z',
      comments: [{
        id: 'comment-copy',
        author: 'assistant',
        body: 'Duplicated comment',
        createdAt: '2026-04-16T11:00:00.000Z'
      }]
    }])

    const promptCalls = []
    const identity = await ensureDocumentIdentityForPath(newPath, {
      async resolveDuplicateDocumentChoice (context) {
        promptCalls.push(context)
        return 'start_new_commenting_session'
      }
    })
    const newRecord = await loadDocumentRecord(newPath)
    const newComments = await loadComments(newPath)
    const oldRecord = await loadDocumentRecord(oldPath)
    const oldComments = await loadComments(oldPath)
    const markdown = await fs.readFile(newPath, 'utf8')

    expect(promptCalls).to.have.length(1)
    expect(promptCalls[0].documentId).to.equal('doc-123')
    expect(promptCalls[0].pathname).to.equal(newPath)
    expect(promptCalls[0].existingPathname).to.equal(oldPath)
    expect(identity.documentId).to.match(/^[0-9a-f-]{36}$/)
    expect(identity.documentId).to.not.equal('doc-123')
    expect(newRecord.documentId).to.equal(identity.documentId)
    expect(newRecord.lastKnownMarkdownPath).to.equal(newPath)
    expect(newRecord.conversationHistory).to.deep.equal([])
    expect(newComments).to.deep.equal([])
    expect(oldRecord.documentId).to.equal('doc-123')
    expect(oldRecord.lastKnownMarkdownPath).to.equal(oldPath)
    expect(oldComments[0].comments[0].body).to.equal('Original comment')
    expect(markdown).to.equal(`<!-- flowrite:id=${identity.documentId} -->\n\n# Draft\n`)
  })

  it('clears destination snapshots when starting a new commenting session from a copied sidecar', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const oldPath = path.join(tempRoot, 'docs', 'draft.md')
    const newPath = path.join(tempRoot, 'archive', 'draft-copy.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await fs.writeFile(newPath, '<!-- flowrite:id=doc-123 -->\n\n# Draft\n', 'utf8')
    await saveDocumentRecord(oldPath, {
      documentId: 'doc-123',
      lastKnownMarkdownPath: oldPath
    })
    await saveDocumentRecord(newPath, {
      documentId: 'doc-123',
      lastKnownMarkdownPath: oldPath
    })
    await ensureSnapshotForAcceptedSuggestion(newPath, '# Draft before fork\n', {
      saveCycleId: 'save-cycle-copy',
      suggestionId: 'suggestion-copy',
      createdAt: '2026-04-16T16:00:00.000Z'
    })

    const beforeSnapshots = await listSnapshots(newPath)
    const identity = await ensureDocumentIdentityForPath(newPath, {
      async resolveDuplicateDocumentChoice () {
        return 'start_new_commenting_session'
      }
    })
    const afterSnapshots = await listSnapshots(newPath)
    const documentRecord = await loadDocumentRecord(newPath)

    expect(beforeSnapshots).to.have.length(1)
    expect(identity.documentId).to.not.equal('doc-123')
    expect(documentRecord.documentId).to.equal(identity.documentId)
    expect(afterSnapshots).to.deep.equal([])
    expect(await fs.pathExists(getSidecarPaths(newPath).snapshotsDir)).to.equal(true)
  })

  it('ignores a stale index mapping whose target no longer belongs to that documentId', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const canonicalPath = path.join(tempRoot, 'docs', 'canonical.md')
    const copiedPath = path.join(tempRoot, 'archive', 'copied.md')

    await fs.ensureDir(path.dirname(canonicalPath))
    await fs.ensureDir(path.dirname(copiedPath))
    await fs.writeFile(canonicalPath, '<!-- flowrite:id=doc-new -->\n\n# Canonical\n', 'utf8')
    await fs.writeFile(copiedPath, '<!-- flowrite:id=doc-old -->\n\n# Copy\n', 'utf8')

    await saveDocumentRecord(canonicalPath, {
      documentId: 'doc-new',
      lastKnownMarkdownPath: canonicalPath
    })
    await saveComments(canonicalPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T12:00:00.000Z',
      updatedAt: '2026-04-16T12:00:00.000Z',
      comments: [{
        id: 'canonical-comment-1',
        author: 'assistant',
        body: 'Canonical comment',
        createdAt: '2026-04-16T12:00:00.000Z'
      }]
    }])
    await rememberDocumentIndexEntry({
      documentId: 'doc-old',
      pathname: canonicalPath,
      documentDir: getSidecarPaths(canonicalPath).documentDir
    })

    const promptCalls = []
    const identity = await ensureDocumentIdentityForPath(copiedPath, {
      async resolveDuplicateDocumentChoice (context) {
        promptCalls.push(context)
        return 'inherit_existing_comments'
      }
    })
    const copiedRecord = await loadDocumentRecord(copiedPath)
    const canonicalRecord = await loadDocumentRecord(canonicalPath)
    const copiedMarkdown = await fs.readFile(copiedPath, 'utf8')
    const canonicalComments = await loadComments(canonicalPath)
    const copiedComments = await loadComments(copiedPath)
    const staleEntry = await findDocumentIndexEntry('doc-old')
    const currentEntry = await findDocumentIndexEntry('doc-new')

    expect(promptCalls).to.deep.equal([])
    expect(identity.documentId).to.equal('doc-old')
    expect(copiedRecord.documentId).to.equal('doc-old')
    expect(copiedRecord.lastKnownMarkdownPath).to.equal(copiedPath)
    expect(copiedMarkdown).to.equal('<!-- flowrite:id=doc-old -->\n\n# Copy\n')
    expect(copiedComments).to.deep.equal([])
    expect(canonicalRecord.documentId).to.equal('doc-new')
    expect(canonicalRecord.lastKnownMarkdownPath).to.equal(canonicalPath)
    expect(canonicalComments).to.have.length(1)
    expect(canonicalComments[0].comments[0].body).to.equal('Canonical comment')
    expect(await fs.pathExists(getSidecarPaths(canonicalPath).documentDir)).to.equal(true)
    expect(staleEntry.pathname).to.equal(copiedPath)
    expect(staleEntry.documentDir).to.equal(getSidecarPaths(copiedPath).documentDir)
    expect(currentEntry.pathname).to.equal(canonicalPath)
  })

  it('does not migrate orphaned sidecars from a missing-markdown stale index mapping', async function () {
    configureDocumentIndex({ rootPath: tempRoot })

    const orphanPath = path.join(tempRoot, 'docs', 'orphaned.md')
    const recoveredPath = path.join(tempRoot, 'archive', 'recovered.md')

    await fs.ensureDir(path.dirname(orphanPath))
    await fs.ensureDir(path.dirname(recoveredPath))
    await fs.writeFile(recoveredPath, '<!-- flowrite:id=doc-old -->\n\n# Recovered\n', 'utf8')

    await saveDocumentRecord(orphanPath, {
      documentId: 'doc-other',
      lastKnownMarkdownPath: orphanPath
    })
    await saveComments(orphanPath, [{
      id: FLOWRITE_GLOBAL_THREAD_ID,
      scope: 'global',
      createdAt: '2026-04-16T13:00:00.000Z',
      updatedAt: '2026-04-16T13:00:00.000Z',
      comments: [{
        id: 'orphan-comment-1',
        author: 'assistant',
        body: 'Orphaned comment',
        createdAt: '2026-04-16T13:00:00.000Z'
      }]
    }])
    await rememberDocumentIndexEntry({
      documentId: 'doc-old',
      pathname: orphanPath,
      documentDir: getSidecarPaths(orphanPath).documentDir
    })
    await fs.remove(orphanPath)

    const promptCalls = []
    const identity = await ensureDocumentIdentityForPath(recoveredPath, {
      async resolveDuplicateDocumentChoice (context) {
        promptCalls.push(context)
        return 'inherit_existing_comments'
      }
    })
    const recoveredRecord = await loadDocumentRecord(recoveredPath)
    const recoveredComments = await loadComments(recoveredPath)
    const orphanComments = await loadComments(orphanPath)
    const repairedEntry = await findDocumentIndexEntry('doc-old')

    expect(promptCalls).to.deep.equal([])
    expect(identity.documentId).to.equal('doc-old')
    expect(recoveredRecord.documentId).to.equal('doc-old')
    expect(recoveredRecord.lastKnownMarkdownPath).to.equal(recoveredPath)
    expect(recoveredComments).to.deep.equal([])
    expect(orphanComments).to.have.length(1)
    expect(orphanComments[0].comments[0].body).to.equal('Orphaned comment')
    expect(await fs.pathExists(getSidecarPaths(orphanPath).documentDir)).to.equal(true)
    expect(await fs.pathExists(getSidecarPaths(recoveredPath).documentDir)).to.equal(true)
    expect(repairedEntry.pathname).to.equal(recoveredPath)
    expect(repairedEntry.documentDir).to.equal(getSidecarPaths(recoveredPath).documentDir)
  })
})

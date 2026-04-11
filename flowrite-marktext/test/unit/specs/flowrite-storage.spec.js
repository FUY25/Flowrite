import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { expect } from 'chai'
import { writeMarkdownFile } from '../../../src/main/filesystem/markdown'
import {
  getSidecarPaths
} from '../../../src/main/flowrite/files/sidecarPaths'
import {
  loadDocumentRecord,
  migrateSidecarDirectory,
  saveDocumentRecord,
  moveDocumentWithSidecars
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
      await moveDocumentWithSidecars(oldPath, newPath)
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

  it('removes replaced destination sidecars when the source document has none', async function () {
    const oldPath = path.join(tempRoot, 'docs', 'source.md')
    const newPath = path.join(tempRoot, 'archive', 'target.md')

    await fs.ensureDir(path.dirname(oldPath))
    await fs.ensureDir(path.dirname(newPath))
    await fs.writeFile(oldPath, 'source\n', 'utf8')
    await fs.writeFile(newPath, 'destination\n', 'utf8')
    await saveComments(newPath, [{ id: 'dest-comment', body: 'Destination comment' }])

    await moveDocumentWithSidecars(oldPath, newPath)

    expect(await fs.pathExists(oldPath)).to.equal(false)
    expect(await fs.readFile(newPath, 'utf8')).to.equal('source\n')
    expect(await loadComments(newPath)).to.deep.equal([])
    expect(await fs.pathExists(getSidecarPaths(newPath).documentDir)).to.equal(false)
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
})

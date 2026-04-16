import { getSidecarPaths } from './sidecarPaths'
import { loadJsonSidecar, quarantineCorruptJson, writeJsonSidecar } from './documentStore'
import { loadSuggestions, saveSuggestions } from './suggestionsStore'
import { cloneMarginAnchor } from '../../../flowrite/anchors'
import { isPlainObject } from '../../../flowrite/objectUtils'
import {
  FLOWRITE_GLOBAL_THREAD_ID,
  FLOWRITE_THREAD_MODE_COMMENTING,
  FLOWRITE_THREAD_MODE_COWRITING,
  SCOPE_GLOBAL,
  SCOPE_MARGIN,
  THREAD_STATUS_OPEN,
  THREAD_STATUS_RESOLVED,
  AUTHOR_USER,
  AUTHOR_ASSISTANT
} from '../../../flowrite/constants'

export { FLOWRITE_GLOBAL_THREAD_ID }

const createId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`

const toIsoDate = value => {
  if (typeof value === 'string' && value) {
    return value
  }

  return new Date().toISOString()
}

const normalizeAuthor = value => {
  return value === AUTHOR_USER ? AUTHOR_USER : AUTHOR_ASSISTANT
}

const normalizeInteractionMode = value => {
  return value === FLOWRITE_THREAD_MODE_COWRITING
    ? FLOWRITE_THREAD_MODE_COWRITING
    : FLOWRITE_THREAD_MODE_COMMENTING
}

const normalizeCommentEntry = (comment = {}, fallback = {}) => {
  const createdAt = toIsoDate(comment.createdAt || fallback.createdAt)
  return {
    id: comment.id || createId('comment'),
    author: normalizeAuthor(comment.author || comment.role || fallback.author),
    body: typeof comment.body === 'string'
      ? comment.body
      : (typeof comment.content === 'string' ? comment.content : ''),
    createdAt
  }
}

const createThreadRecord = ({ id, scope, anchor, createdAt, interactionMode }) => ({
  id,
  scope,
  anchor: scope === SCOPE_MARGIN ? cloneMarginAnchor(anchor) : null,
  status: THREAD_STATUS_OPEN,
  createdAt,
  updatedAt: createdAt,
  interactionMode: normalizeInteractionMode(interactionMode),
  comments: []
})

const normalizeThreadEntry = thread => {
  const createdAt = toIsoDate(thread.createdAt)
  const scope = thread.scope === SCOPE_MARGIN ? SCOPE_MARGIN : SCOPE_GLOBAL
  const comments = Array.isArray(thread.comments)
    ? thread.comments
      .map(comment => normalizeCommentEntry(comment, {
        author: thread.author,
        createdAt
      }))
      .filter(comment => comment.body)
    : []

  const updatedAt = comments.length
    ? comments[comments.length - 1].createdAt
    : toIsoDate(thread.updatedAt || createdAt)

  return {
    id: thread.id || (scope === SCOPE_GLOBAL ? FLOWRITE_GLOBAL_THREAD_ID : createId('thread')),
    scope,
    anchor: scope === SCOPE_MARGIN ? cloneMarginAnchor(thread.anchor) : null,
    status: typeof thread.status === 'string' && thread.status ? thread.status : THREAD_STATUS_OPEN,
    createdAt,
    updatedAt,
    interactionMode: normalizeInteractionMode(thread.interactionMode),
    comments
  }
}

export const normalizeComments = comments => {
  if (!Array.isArray(comments)) {
    throw new Error('Flowrite comments sidecar must be a JSON array.')
  }

  const normalizedThreads = []
  const legacyThreads = new Map()

  for (const entry of comments) {
    if (!isPlainObject(entry)) {
      continue
    }

    if (Array.isArray(entry.comments)) {
      normalizedThreads.push(normalizeThreadEntry(entry))
      continue
    }

    const scope = entry.scope === SCOPE_MARGIN ? SCOPE_MARGIN : SCOPE_GLOBAL
    const threadId = entry.threadId || (scope === SCOPE_GLOBAL ? FLOWRITE_GLOBAL_THREAD_ID : createId('thread'))
    const createdAt = toIsoDate(entry.createdAt)
    const key = `${scope}:${threadId}`
    if (!legacyThreads.has(key)) {
      legacyThreads.set(key, createThreadRecord({
        id: threadId,
        scope,
        anchor: entry.anchor,
        createdAt,
        interactionMode: entry.interactionMode
      }))
    }

    const thread = legacyThreads.get(key)
    thread.interactionMode = normalizeInteractionMode(entry.interactionMode || thread.interactionMode)
    const comment = normalizeCommentEntry(entry, {
      author: entry.author || entry.role,
      createdAt
    })
    if (!comment.body) {
      continue
    }

    if (!thread.comments.length) {
      thread.createdAt = comment.createdAt
    }
    thread.comments.push(comment)
    thread.updatedAt = comment.createdAt
  }

  normalizedThreads.push(...legacyThreads.values())

  return normalizedThreads.map(normalizeThreadEntry)
}

export const loadComments = async pathname => {
  const { commentsFile } = getSidecarPaths(pathname)
  const comments = await loadJsonSidecar(commentsFile, [])

  try {
    return normalizeComments(comments)
  } catch (error) {
    await quarantineCorruptJson(commentsFile)
    return []
  }
}

const MAX_RESOLVED_THREADS = 30
const RESOLVED_THREAD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const MAX_COMMENTS_PER_THREAD = 200

const compactThreads = threads => {
  const now = Date.now()
  const active = []
  const resolved = []

  for (const thread of threads) {
    // Never prune the global thread
    if (thread.id === FLOWRITE_GLOBAL_THREAD_ID) {
      active.push({
        ...thread,
        comments: thread.comments.length > MAX_COMMENTS_PER_THREAD
          ? thread.comments.slice(thread.comments.length - MAX_COMMENTS_PER_THREAD)
          : thread.comments
      })
      continue
    }

    if (thread.status === THREAD_STATUS_RESOLVED) {
      resolved.push(thread)
    } else {
      active.push({
        ...thread,
        comments: thread.comments.length > MAX_COMMENTS_PER_THREAD
          ? thread.comments.slice(thread.comments.length - MAX_COMMENTS_PER_THREAD)
          : thread.comments
      })
    }
  }

  const prunedResolved = resolved.filter(thread => {
    const timestamp = thread.updatedAt
    if (!timestamp) {
      return true
    }
    return (now - new Date(timestamp).getTime()) < RESOLVED_THREAD_MAX_AGE_MS
  })

  const trimmedResolved = prunedResolved.length > MAX_RESOLVED_THREADS
    ? prunedResolved.slice(prunedResolved.length - MAX_RESOLVED_THREADS)
    : prunedResolved

  return [...active, ...trimmedResolved]
}

const prepareCommentsForSave = comments => {
  return compactThreads(normalizeComments(comments))
}

const writePreparedComments = async (pathname, comments) => {
  const { commentsFile } = getSidecarPaths(pathname)
  await writeJsonSidecar(commentsFile, comments)
}

export const saveComments = async (pathname, comments) => {
  await writePreparedComments(pathname, prepareCommentsForSave(comments))
}

export const appendCommentToThread = async (pathname, {
  threadId,
  scope = SCOPE_GLOBAL,
  anchor = null,
  author = AUTHOR_ASSISTANT,
  body,
  interactionMode
} = {}) => {
  const trimmedBody = typeof body === 'string' ? body.trim() : ''
  if (!trimmedBody) {
    throw new Error('Flowrite comments require a non-empty body.')
  }

  const normalizedScope = scope === SCOPE_MARGIN ? SCOPE_MARGIN : SCOPE_GLOBAL
  const comments = await loadComments(pathname)
  const now = new Date().toISOString()
  const resolvedThreadId = threadId || (normalizedScope === SCOPE_GLOBAL ? FLOWRITE_GLOBAL_THREAD_ID : createId('thread'))
  let thread = comments.find(candidate => candidate.id === resolvedThreadId)

  if (!thread) {
    thread = createThreadRecord({
      id: resolvedThreadId,
      scope: normalizedScope,
      anchor,
      createdAt: now,
      interactionMode
    })
    comments.push(thread)
  }

  const comment = normalizeCommentEntry({
    author,
    body: trimmedBody,
    createdAt: now
  })

  thread.scope = normalizedScope
  if (normalizedScope === SCOPE_MARGIN) {
    thread.anchor = cloneMarginAnchor(anchor) || cloneMarginAnchor(thread.anchor)
  } else {
    thread.anchor = null
  }
  thread.status = thread.status || THREAD_STATUS_OPEN
  thread.createdAt = thread.createdAt || now
  thread.interactionMode = normalizeInteractionMode(interactionMode || thread.interactionMode)
  thread.updatedAt = comment.createdAt
  thread.comments = Array.isArray(thread.comments) ? thread.comments : []
  thread.comments.push(comment)

  const persistedComments = prepareCommentsForSave(comments)
  await writePreparedComments(pathname, persistedComments)
  const persistedThread = persistedComments.find(candidate => candidate.id === resolvedThreadId) || thread
  const persistedComment = Array.isArray(persistedThread.comments)
    ? persistedThread.comments.find(entry => entry.id === comment.id) || comment
    : comment

  return {
    comments: persistedComments,
    thread: persistedThread,
    comment: persistedComment
  }
}

export const deleteThreadFromComments = async (pathname, {
  threadId,
  scope = SCOPE_MARGIN
} = {}) => {
  if (!threadId) {
    throw new Error('Flowrite thread deletion requires a threadId.')
  }

  if (scope !== SCOPE_MARGIN) {
    throw new Error('Flowrite thread deletion only supports margin threads.')
  }

  const [comments, suggestions] = await Promise.all([
    loadComments(pathname),
    loadSuggestions(pathname)
  ])
  const nextComments = comments.filter(thread => {
    return !(thread.id === threadId && thread.scope === SCOPE_MARGIN)
  })

  if (nextComments.length === comments.length) {
    return {
      pathname,
      comments,
      suggestions,
      deleted: false
    }
  }

  const nextSuggestions = suggestions.filter(suggestion => suggestion.threadId !== threadId)
  if (nextSuggestions.length !== suggestions.length) {
    await saveSuggestions(pathname, nextSuggestions)
  }

  try {
    const persistedComments = prepareCommentsForSave(nextComments)
    await writePreparedComments(pathname, persistedComments)

    return {
      pathname,
      comments: persistedComments,
      suggestions: nextSuggestions,
      deleted: true
    }
  } catch (error) {
    if (nextSuggestions.length !== suggestions.length) {
      try {
        await saveSuggestions(pathname, suggestions)
      } catch (_) {
        // Best-effort rollback. The original write failure is the actionable one.
      }
    }
    throw error
  }
}

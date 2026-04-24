import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import { getSidecarPaths } from './sidecarPaths'
import { loadDocumentRecord, saveDocumentRecord, writeJsonSidecar, loadJsonSidecar } from './documentStore'

export const SNAPSHOT_KIND_DOCUMENT_SAVE = 'document_save'
export const SNAPSHOT_KIND_ACCEPTED_SUGGESTION = 'accepted_suggestion_pre_save'

const sanitizeSuffix = value => {
  if (!value) {
    return ''
  }

  return String(value)
    .replace(/[^a-z0-9_-]+/ig, '-')
    .replace(/^-+|-+$/g, '')
}

const toSnapshotFilename = ({ createdAt, suffix }) => {
  const timestamp = createdAt.replace(/[:.]/g, '-')
  return `${timestamp}${suffix || '-snapshot'}.json`
}

const toSnapshotId = filename => filename.replace(/\.json$/i, '')

const toMarkdownHash = markdown => {
  return crypto
    .createHash('sha1')
    .update(typeof markdown === 'string' ? markdown : '', 'utf8')
    .digest('hex')
}

const buildSnapshotRecord = ({
  markdown = '',
  createdAt = new Date().toISOString(),
  kind = SNAPSHOT_KIND_DOCUMENT_SAVE,
  suggestionId = null,
  saveCycleId = null,
  saveReason = null
} = {}) => {
  const normalizedMarkdown = typeof markdown === 'string' ? markdown : ''
  const suffix = kind === SNAPSHOT_KIND_ACCEPTED_SUGGESTION
    ? `-${sanitizeSuffix(suggestionId) || 'snapshot'}`
    : `-${sanitizeSuffix(saveReason) || 'snapshot'}`
  const filename = toSnapshotFilename({ createdAt, suffix })

  return {
    filename,
    record: {
      id: toSnapshotId(filename),
      createdAt,
      kind,
      markdown: normalizedMarkdown,
      saveCycleId: saveCycleId || null,
      suggestionId: suggestionId || null,
      saveReason: saveReason || null,
      hash: toMarkdownHash(normalizedMarkdown)
    }
  }
}

const normalizeSnapshotRecord = (snapshot, filename = '') => {
  if (!snapshot || typeof snapshot !== 'object') {
    return null
  }

  const markdown = typeof snapshot.markdown === 'string' ? snapshot.markdown : ''
  const fallbackId = filename ? toSnapshotId(filename) : ''
  const kind = snapshot.kind || (snapshot.suggestionId ? SNAPSHOT_KIND_ACCEPTED_SUGGESTION : SNAPSHOT_KIND_DOCUMENT_SAVE)

  return {
    id: snapshot.id || fallbackId,
    createdAt: snapshot.createdAt || '',
    kind,
    markdown,
    saveCycleId: snapshot.saveCycleId || null,
    suggestionId: snapshot.suggestionId || null,
    saveReason: snapshot.saveReason || null,
    hash: snapshot.hash || toMarkdownHash(markdown)
  }
}

const writeSnapshot = async (pathname, snapshotConfig = {}) => {
  const { record, filename } = buildSnapshotRecord(snapshotConfig)
  const { snapshotsDir } = getSidecarPaths(pathname)
  const snapshotPath = path.join(snapshotsDir, filename)
  await writeJsonSidecar(snapshotPath, record)
  return {
    snapshot: record,
    snapshotPath
  }
}

export const ensureSnapshotForAcceptedSuggestion = async (pathname, markdown, snapshotRequest) => {
  if (!snapshotRequest || !snapshotRequest.saveCycleId) {
    throw new Error('Flowrite snapshot requests require a saveCycleId.')
  }

  const { saveCycleId, suggestionId = null, createdAt = new Date().toISOString() } = snapshotRequest
  const documentRecord = await loadDocumentRecord(pathname)
  if (documentRecord.lastSnapshotSaveCycleId === saveCycleId) {
    return { created: false }
  }

  const result = await writeSnapshot(pathname, {
    markdown,
    createdAt,
    kind: SNAPSHOT_KIND_ACCEPTED_SUGGESTION,
    suggestionId,
    saveCycleId
  })

  await saveDocumentRecord(pathname, {
    ...documentRecord,
    lastSnapshotSaveCycleId: saveCycleId
  })

  return {
    created: true,
    snapshotPath: result.snapshotPath,
    snapshot: result.snapshot
  }
}

export const recordDocumentSnapshot = async (pathname, markdown, snapshotRequest = {}) => {
  const documentRecord = await loadDocumentRecord(pathname)
  const normalizedMarkdown = typeof markdown === 'string' ? markdown : ''
  const nextHash = toMarkdownHash(normalizedMarkdown)

  if (documentRecord.lastVersionSnapshotHash === nextHash) {
    return {
      created: false,
      snapshot: null
    }
  }

  const createdAt = snapshotRequest.createdAt || new Date().toISOString()
  const result = await writeSnapshot(pathname, {
    markdown: normalizedMarkdown,
    createdAt,
    kind: SNAPSHOT_KIND_DOCUMENT_SAVE,
    saveReason: snapshotRequest.saveReason || 'manual_save',
    saveCycleId: snapshotRequest.saveCycleId || null,
    suggestionId: snapshotRequest.suggestionId || null
  })

  await saveDocumentRecord(pathname, {
    ...documentRecord,
    lastVersionSnapshotHash: nextHash,
    lastVersionSnapshotAt: createdAt
  })

  return {
    created: true,
    snapshotPath: result.snapshotPath,
    snapshot: result.snapshot
  }
}

export const listSnapshots = async pathname => {
  const { snapshotsDir } = getSidecarPaths(pathname)
  if (!await fs.pathExists(snapshotsDir)) {
    return []
  }

  const entries = (await fs.readdir(snapshotsDir))
    .filter(entry => entry.endsWith('.json'))
    .sort()
    .reverse()

  const snapshots = await Promise.all(entries.map(async entry => {
    const snapshotPath = path.join(snapshotsDir, entry)
    const snapshot = await loadJsonSidecar(snapshotPath, null)
    return normalizeSnapshotRecord(snapshot, entry)
  }))

  return snapshots.filter(Boolean)
}

export const loadSnapshot = async (pathname, snapshotId) => {
  if (!pathname || !snapshotId) {
    return null
  }

  const { snapshotsDir } = getSidecarPaths(pathname)
  const snapshotPath = path.join(snapshotsDir, `${snapshotId}.json`)
  const snapshot = await loadJsonSidecar(snapshotPath, null)
  return normalizeSnapshotRecord(snapshot, `${snapshotId}.json`)
}

import path from 'path'
import fs from 'fs-extra'
import { getSidecarPaths } from './sidecarPaths'
import { loadDocumentRecord, saveDocumentRecord, writeJsonSidecar, loadJsonSidecar } from './documentStore'

const toSnapshotFilename = ({ createdAt, suggestionId }) => {
  const timestamp = createdAt.replace(/[:.]/g, '-')
  const suffix = suggestionId ? `-${String(suggestionId).replace(/[^a-z0-9_-]+/ig, '-').replace(/^-+|-+$/g, '')}` : ''
  return `${timestamp}${suffix || '-snapshot'}.json`
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

  const { snapshotsDir } = getSidecarPaths(pathname)
  const snapshotFilename = toSnapshotFilename({ createdAt, suggestionId })
  const snapshotPath = path.join(snapshotsDir, snapshotFilename)
  await writeJsonSidecar(snapshotPath, {
    createdAt,
    markdown,
    saveCycleId,
    suggestionId
  })

  await saveDocumentRecord(pathname, {
    ...documentRecord,
    lastSnapshotSaveCycleId: saveCycleId
  })

  return {
    created: true,
    snapshotPath
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

  return Promise.all(entries.map(async entry => {
    const snapshotPath = path.join(snapshotsDir, entry)
    const snapshot = await loadJsonSidecar(snapshotPath, null)
    return snapshot
  }))
}

import path from 'path'
import fs from 'fs-extra'
import log from 'electron-log'
import { getSidecarPaths } from './sidecarPaths'
import { resolveMarkdownFilePath } from '../../filesystem/markdownPaths'
import { createDocumentId } from './documentIdentity'
import { isPlainObject } from '../../../flowrite/objectUtils'
import {
  rememberDocumentIndexEntry,
  findDocumentIndexEntry,
  removeDocumentIndexEntry,
  replaceDocumentIndexEntry
} from './documentIndex'

const DOCUMENT_VERSION = 1
const DUPLICATE_DOCUMENT_CHOICE_START_NEW = 'start_new_commenting_session'
const DUPLICATE_DOCUMENT_CHOICE_INHERIT = 'inherit_existing_comments'

export const DEFAULT_DOCUMENT_RECORD = {
  version: DOCUMENT_VERSION,
  documentId: '',
  lastKnownMarkdownPath: '',
  lastSnapshotSaveCycleId: null,
  conversationHistory: [],
  historyTokenEstimate: 0,
  responseStyle: 'comment_only',
  lastReviewPersona: 'improvement'
}

const getTempFilePath = pathname => {
  const parsed = path.parse(pathname)
  return path.join(parsed.dir, `.${parsed.base}.${process.pid}.${Date.now()}.tmp`)
}

const getBackupPath = pathname => {
  const parsed = path.parse(pathname)
  return path.join(parsed.dir, `.${parsed.base}.${process.pid}.${Date.now()}.bak`)
}

export const quarantineCorruptJson = async pathname => {
  const corruptPath = `${pathname}.corrupt`
  if (await fs.pathExists(corruptPath)) {
    await fs.remove(corruptPath)
  }
  await fs.move(pathname, corruptPath, { overwrite: true })
}

const cleanupFlowriteRootIfEmpty = async flowriteRoot => {
  if (!await fs.pathExists(flowriteRoot)) {
    return
  }

  const entries = await fs.readdir(flowriteRoot)
  if (entries.length === 0) {
    await fs.remove(flowriteRoot)
  }
}

export const loadJsonSidecar = async (pathname, fallbackValue) => {
  if (!await fs.pathExists(pathname)) {
    return fallbackValue
  }

  try {
    return await fs.readJson(pathname)
  } catch (error) {
    await quarantineCorruptJson(pathname)
    return fallbackValue
  }
}

export const writeJsonSidecar = async (pathname, value) => {
  const tempPath = getTempFilePath(pathname)
  await fs.ensureDir(path.dirname(pathname))
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.move(tempPath, pathname, { overwrite: true })
}

export const createSidecarSaveTransaction = async pathname => {
  const { documentDir, flowriteRoot } = getSidecarPaths(pathname)
  const hasExistingDocumentDir = await fs.pathExists(documentDir)
  const backupDir = hasExistingDocumentDir ? getBackupPath(documentDir) : null

  if (backupDir) {
    await fs.copy(documentDir, backupDir, { overwrite: true, errorOnExist: false })
  }

  const cleanupBackupDir = async () => {
    if (backupDir && await fs.pathExists(backupDir)) {
      await fs.remove(backupDir)
    }
  }

  return {
    commit: async () => {
      try {
        await cleanupBackupDir()
      } catch (error) {
        // Backup cleanup is best-effort after the save already committed.
        log.warn(`Flowrite sidecar backup cleanup failed for "${pathname}".`, error)
      }
    },
    rollback: async () => {
      if (backupDir) {
        if (await fs.pathExists(documentDir)) {
          await fs.remove(documentDir)
        }
        await fs.move(backupDir, documentDir, { overwrite: true })
        return
      }

      if (await fs.pathExists(documentDir)) {
        await fs.remove(documentDir)
      }
      await cleanupFlowriteRootIfEmpty(flowriteRoot)
    }
  }
}

const movePathToBackup = async pathname => {
  if (!await fs.pathExists(pathname)) {
    return null
  }

  const backupPath = getBackupPath(pathname)
  await fs.move(pathname, backupPath, { overwrite: false })
  return backupPath
}

const restoreBackup = async (backupPath, pathname) => {
  if (!backupPath || !await fs.pathExists(backupPath)) {
    return
  }
  await fs.move(backupPath, pathname, { overwrite: false })
}

const cleanupBackup = async backupPath => {
  if (backupPath && await fs.pathExists(backupPath)) {
    await fs.remove(backupPath)
  }
}

const cloneJsonValue = value => JSON.parse(JSON.stringify(value))

const createBlankDocumentRecord = ({ pathname, documentId }) => ({
  ...DEFAULT_DOCUMENT_RECORD,
  documentId,
  lastKnownMarkdownPath: pathname,
  version: DOCUMENT_VERSION
})

const createInheritedDocumentRecord = ({ sourceRecord, pathname, documentId }) => ({
  ...DEFAULT_DOCUMENT_RECORD,
  ...cloneJsonValue(sourceRecord),
  documentId,
  lastKnownMarkdownPath: pathname,
  lastSnapshotSaveCycleId: null,
  version: DOCUMENT_VERSION
})

const getMarkdownWriteOptions = rawDocument => ({
  adjustLineEndingOnSave: rawDocument.adjustLineEndingOnSave,
  lineEnding: rawDocument.lineEnding,
  encoding: rawDocument.encoding,
  trimTrailingNewline: rawDocument.trimTrailingNewline
})

const resolveComparablePath = pathname => {
  if (!pathname) {
    return ''
  }

  return resolveMarkdownFilePath(pathname)
}

const persistBootstrappedDocumentState = async ({
  pathname,
  rawDocument,
  document,
  comments,
  suggestions
}) => {
  const { writeMarkdownFile } = await import('../../filesystem/markdown')

  await writeMarkdownFile(pathname, rawDocument.markdown, getMarkdownWriteOptions(rawDocument), {
    flowrite: {
      document,
      comments,
      suggestions
    }
  })
}

const resetDestinationSnapshots = async pathname => {
  const { snapshotsDir } = getSidecarPaths(pathname)
  if (await fs.pathExists(snapshotsDir)) {
    await fs.remove(snapshotsDir)
  }
  await fs.ensureDir(snapshotsDir)
}

const resolveLiveDocumentIdentityPath = async ({
  candidatePath,
  documentId,
  loadMarkdownFile
}) => {
  const resolvedCandidatePath = resolveComparablePath(candidatePath)
  if (!resolvedCandidatePath || !documentId || !await fs.pathExists(resolvedCandidatePath)) {
    return ''
  }

  const candidateRecord = await loadDocumentRecord(resolvedCandidatePath)
  if (candidateRecord.documentId === documentId) {
    return resolvedCandidatePath
  }

  const candidateMarkdown = await loadMarkdownFile(resolvedCandidatePath, 'lf', true, 2)
  return candidateMarkdown.flowriteDocumentId === documentId
    ? resolvedCandidatePath
    : ''
}

const resolveOrphanedMoveSourcePath = async ({
  candidatePath,
  documentId
}) => {
  const resolvedCandidatePath = resolveComparablePath(candidatePath)
  if (!resolvedCandidatePath || !documentId) {
    return ''
  }

  const candidateRecord = await loadDocumentRecord(resolvedCandidatePath)
  return candidateRecord.documentId === documentId
    ? resolvedCandidatePath
    : ''
}

export const loadDocumentRecord = async pathname => {
  const { documentFile } = getSidecarPaths(pathname)
  const record = await loadJsonSidecar(documentFile, DEFAULT_DOCUMENT_RECORD)
  return {
    ...DEFAULT_DOCUMENT_RECORD,
    ...(isPlainObject(record) ? record : {})
  }
}

export const saveDocumentRecord = async (pathname, record) => {
  if (!isPlainObject(record)) {
    throw new Error('Flowrite document sidecar must be a JSON object.')
  }

  pathname = resolveMarkdownFilePath(pathname)
  const { documentFile, documentDir } = getSidecarPaths(pathname)
  const previousRecord = await loadDocumentRecord(pathname)
  const nextRecord = {
    ...DEFAULT_DOCUMENT_RECORD,
    ...record,
    lastKnownMarkdownPath: record.lastKnownMarkdownPath || pathname,
    version: DOCUMENT_VERSION
  }

  const documentBackup = await movePathToBackup(documentFile)

  try {
    await writeJsonSidecar(documentFile, nextRecord)

    await replaceDocumentIndexEntry({
      previousDocumentId: previousRecord.documentId,
      previousPathname: previousRecord.lastKnownMarkdownPath || '',
      previousDocumentDir: documentDir,
      documentId: nextRecord.documentId,
      pathname: nextRecord.lastKnownMarkdownPath,
      documentDir
    })
  } catch (error) {
    if (await fs.pathExists(documentFile)) {
      await fs.remove(documentFile)
    }
    await restoreBackup(documentBackup, documentFile)
    throw error
  }

  try {
    await cleanupBackup(documentBackup)
  } catch (error) {
    log.warn(`Flowrite document backup cleanup failed for "${pathname}".`, error)
  }

  return nextRecord
}

export const ensureDocumentIdentityForPath = async (pathname, {
  resolveDuplicateDocumentChoice
} = {}) => {
  pathname = resolveMarkdownFilePath(pathname)
  const { loadMarkdownFile } = await import('../../filesystem/markdown')
  const rawDocument = await loadMarkdownFile(pathname, 'lf', true, 2)
  const embeddedDocumentId = rawDocument.flowriteDocumentId || ''
  const currentPaths = getSidecarPaths(pathname)
  let currentRecord = await loadDocumentRecord(pathname)
  const currentRecordKnownPath = resolveComparablePath(currentRecord.lastKnownMarkdownPath)
  const recoveryDocumentId = embeddedDocumentId || currentRecord.documentId || ''

  const indexedRecord = recoveryDocumentId
    ? await findDocumentIndexEntry(recoveryDocumentId)
    : null
  const indexedCandidatePath = indexedRecord && indexedRecord.pathname
    ? resolveComparablePath(indexedRecord.pathname)
    : ''
  const indexedCandidateExists = Boolean(
    indexedCandidatePath &&
    indexedCandidatePath !== pathname &&
    await fs.pathExists(indexedCandidatePath)
  )
  const liveCurrentRecordPath = currentRecordKnownPath && currentRecordKnownPath !== pathname
    ? await resolveLiveDocumentIdentityPath({
      candidatePath: currentRecordKnownPath,
      documentId: recoveryDocumentId,
      loadMarkdownFile
    })
    : ''
  const liveIndexedPath = indexedCandidatePath && indexedCandidatePath !== pathname
    ? await resolveLiveDocumentIdentityPath({
      candidatePath: indexedCandidatePath,
      documentId: recoveryDocumentId,
      loadMarkdownFile
    })
    : ''
  const orphanedMoveSourcePath = indexedCandidatePath &&
    indexedCandidatePath !== pathname &&
    !indexedCandidateExists
    ? await resolveOrphanedMoveSourcePath({
      candidatePath: indexedCandidatePath,
      documentId: recoveryDocumentId
    })
    : ''
  const hasStaleIndexedMapping = Boolean(
    recoveryDocumentId &&
    indexedRecord &&
    indexedCandidatePath &&
    indexedCandidatePath !== pathname &&
    !liveIndexedPath &&
    ((indexedCandidateExists || !orphanedMoveSourcePath))
  )

  if (hasStaleIndexedMapping) {
    await removeDocumentIndexEntry({
      documentId: recoveryDocumentId,
      pathname: indexedCandidatePath,
      documentDir: indexedRecord.documentDir || ''
    })
  }

  const duplicateSourcePath = liveCurrentRecordPath || liveIndexedPath

  if (
    indexedRecord &&
    orphanedMoveSourcePath &&
    indexedRecord.documentDir &&
    indexedRecord.documentDir !== currentPaths.documentDir &&
    !indexedCandidateExists &&
    !duplicateSourcePath
  ) {
    await migrateSidecarDirectory(orphanedMoveSourcePath, pathname)
    currentRecord = await loadDocumentRecord(pathname)
  }

  if (recoveryDocumentId && duplicateSourcePath) {
    const {
      loadComments
    } = await import('./commentsStore')
    const {
      loadSuggestions
    } = await import('./suggestionsStore')

    const sourceDocumentRecord = await loadDocumentRecord(duplicateSourcePath)
    const choice = typeof resolveDuplicateDocumentChoice === 'function'
      ? await resolveDuplicateDocumentChoice({
        documentId: recoveryDocumentId,
        pathname,
        existingPathname: duplicateSourcePath
      })
      : DUPLICATE_DOCUMENT_CHOICE_START_NEW
    const nextDocumentId = createDocumentId()
    const shouldInheritExistingComments = choice === DUPLICATE_DOCUMENT_CHOICE_INHERIT
    const nextDocumentRecord = shouldInheritExistingComments
      ? createInheritedDocumentRecord({
        sourceRecord: sourceDocumentRecord,
        pathname,
        documentId: nextDocumentId
      })
      : createBlankDocumentRecord({
        pathname,
        documentId: nextDocumentId
      })
    const nextComments = shouldInheritExistingComments
      ? cloneJsonValue(await loadComments(duplicateSourcePath))
      : []
    const nextSuggestions = shouldInheritExistingComments
      ? cloneJsonValue(await loadSuggestions(duplicateSourcePath))
      : []

    await persistBootstrappedDocumentState({
      pathname,
      rawDocument,
      document: nextDocumentRecord,
      comments: nextComments,
      suggestions: nextSuggestions
    })

    if (!shouldInheritExistingComments) {
      await resetDestinationSnapshots(pathname)
    }

    return {
      documentId: nextDocumentId,
      pathname
    }
  }

  if (embeddedDocumentId && recoveryDocumentId && currentRecord.documentId === recoveryDocumentId) {
    if (currentRecordKnownPath !== pathname) {
      currentRecord = await saveDocumentRecord(pathname, {
        ...currentRecord,
        lastKnownMarkdownPath: pathname
      })
    } else {
      await rememberDocumentIndexEntry({
        documentId: recoveryDocumentId,
        pathname,
        documentDir: currentPaths.documentDir
      })
    }

    return {
      documentId: recoveryDocumentId,
      pathname
    }
  }

  const nextDocumentId = recoveryDocumentId || createDocumentId()

  if (!embeddedDocumentId && nextDocumentId) {
    const { loadComments } = await import('./commentsStore')
    const { loadSuggestions } = await import('./suggestionsStore')

    await persistBootstrappedDocumentState({
      pathname,
      rawDocument,
      document: {
        ...currentRecord,
        documentId: nextDocumentId,
        lastKnownMarkdownPath: pathname
      },
      comments: await loadComments(pathname),
      suggestions: await loadSuggestions(pathname)
    })
  } else {
    await saveDocumentRecord(pathname, {
      ...currentRecord,
      documentId: nextDocumentId,
      lastKnownMarkdownPath: pathname
    })
  }

  return {
    documentId: nextDocumentId,
    pathname
  }
}

export const migrateSidecarDirectory = async (oldPathname, newPathname) => {
  oldPathname = resolveMarkdownFilePath(oldPathname)
  newPathname = resolveMarkdownFilePath(newPathname)
  const oldPaths = getSidecarPaths(oldPathname)
  const newPaths = getSidecarPaths(newPathname)

  if (oldPaths.documentDir === newPaths.documentDir) {
    return newPaths
  }

  await fs.ensureDir(path.dirname(newPaths.documentDir))
  const destinationBackup = await movePathToBackup(newPaths.documentDir)
  const sourceHasSidecars = await fs.pathExists(oldPaths.documentDir)

  try {
    if (!sourceHasSidecars) {
      await cleanupBackup(destinationBackup)
      await cleanupFlowriteRootIfEmpty(newPaths.flowriteRoot)
      return newPaths
    }

    await fs.move(oldPaths.documentDir, newPaths.documentDir, { overwrite: false })
    await cleanupBackup(destinationBackup)
    await cleanupFlowriteRootIfEmpty(oldPaths.flowriteRoot)
    return newPaths
  } catch (error) {
    if (await fs.pathExists(newPaths.documentDir)) {
      await fs.move(newPaths.documentDir, oldPaths.documentDir, { overwrite: false })
    }
    await restoreBackup(destinationBackup, newPaths.documentDir)
    throw error
  }
}

export const moveDocumentWithSidecars = async (oldPathname, newPathname) => {
  oldPathname = resolveMarkdownFilePath(oldPathname)
  newPathname = resolveMarkdownFilePath(newPathname)
  if (oldPathname === newPathname) {
    return
  }

  await fs.ensureDir(path.dirname(newPathname))
  const destinationMarkdownBackup = await movePathToBackup(newPathname)

  try {
    await fs.move(oldPathname, newPathname, { overwrite: false })
    await migrateSidecarDirectory(oldPathname, newPathname)
    await cleanupBackup(destinationMarkdownBackup)
  } catch (error) {
    if (await fs.pathExists(newPathname)) {
      await fs.move(newPathname, oldPathname, { overwrite: false })
    }
    await restoreBackup(destinationMarkdownBackup, newPathname)
    throw error
  }
}

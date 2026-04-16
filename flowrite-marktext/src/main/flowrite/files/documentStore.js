import path from 'path'
import fs from 'fs-extra'
import log from 'electron-log'
import { isMarkdownFile } from 'common/filesystem/paths'
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

const cleanupBackupBestEffort = async (backupPath, label) => {
  if (!backupPath) {
    return
  }

  try {
    await cleanupBackup(backupPath)
  } catch (error) {
    log.warn(`${label} cleanup failed.`, error)
  }
}

const cleanupFlowriteRootIfEmptyBestEffort = async (flowriteRoot, label) => {
  if (!flowriteRoot) {
    return
  }

  try {
    await cleanupFlowriteRootIfEmpty(flowriteRoot)
  } catch (error) {
    log.warn(`${label} cleanup failed.`, error)
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

const remapPathForMovedDirectory = (pathname, oldRootPath, newRootPath) => {
  return path.join(newRootPath, path.relative(oldRootPath, pathname))
}

const listMarkdownDescendants = async rootPath => {
  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  const markdownPaths = []

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      markdownPaths.push(...await listMarkdownDescendants(entryPath))
      continue
    }

    if (entry.isFile() && isMarkdownFile(entryPath)) {
      markdownPaths.push(resolveMarkdownFilePath(entryPath))
    }
  }

  return markdownPaths
}

const collectManagedMarkdownDescendants = async rootPath => {
  const { loadMarkdownFile } = await import('../../filesystem/markdown')
  const markdownPaths = await listMarkdownDescendants(rootPath)
  const descendants = []

  for (const oldPathname of markdownPaths) {
    const oldRecord = await loadDocumentRecord(oldPathname)
    const oldPaths = getSidecarPaths(oldPathname)
    const hadDocumentDir = await fs.pathExists(oldPaths.documentDir)
    let rawDocument = null
    try {
      rawDocument = await loadMarkdownFile(oldPathname, 'lf', true, 2)
    } catch (error) {
      if (!hadDocumentDir && !oldRecord.documentId) {
        log.warn(`Flowrite move scan skipped unreadable markdown descendant "${oldPathname}".`, error)
        continue
      }
    }
    const embeddedDocumentId = rawDocument ? rawDocument.flowriteDocumentId || '' : ''
    const effectiveDocumentId = oldRecord.documentId || embeddedDocumentId
    const isManaged = Boolean(hadDocumentDir || oldRecord.documentId || embeddedDocumentId)

    if (!isManaged) {
      continue
    }

    descendants.push({
      oldPathname,
      oldRecord,
      oldDocumentDir: oldPaths.documentDir,
      embeddedDocumentId,
      effectiveDocumentId,
      previousIndexEntry: effectiveDocumentId
        ? await findDocumentIndexEntry(effectiveDocumentId)
        : null,
      hadDocumentDir
    })
  }

  return descendants
}

const listDocumentSidecarsUnderRoot = async rootPath => {
  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  const sidecarFiles = []

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      sidecarFiles.push(...await listDocumentSidecarsUnderRoot(entryPath))
      continue
    }

    if (entry.isFile() && entry.name === 'document.json' && entryPath.split(path.sep).includes('.flowrite')) {
      sidecarFiles.push(entryPath)
    }
  }

  return sidecarFiles
}

const collectStaleManagedSidecarOnlyContexts = async rootPath => {
  const sidecarFiles = await listDocumentSidecarsUnderRoot(rootPath)
  const contexts = []

  for (const documentFile of sidecarFiles) {
    const record = await loadJsonSidecar(documentFile, DEFAULT_DOCUMENT_RECORD)
    const pathname = isPlainObject(record) && record.lastKnownMarkdownPath
      ? resolveMarkdownFilePath(record.lastKnownMarkdownPath)
      : ''

    if (!pathname || !pathname.startsWith(`${path.resolve(rootPath)}${path.sep}`)) {
      continue
    }

    if (await fs.pathExists(pathname)) {
      continue
    }

    const rollbackContext = await createMoveDocumentIdentityRollbackContext(pathname, {
      tolerateUnreadableMarkdown: true
    })

    if (!rollbackContext.effectiveDocumentId) {
      continue
    }

    contexts.push(rollbackContext)
  }

  return contexts
}

const normalizeManagedDocumentToRollbackContext = document => ({
  pathname: document.oldPathname,
  documentDir: document.oldDocumentDir,
  hadDocumentDir: document.hadDocumentDir,
  previousRecord: document.oldRecord,
  previousIndexEntry: document.previousIndexEntry,
  effectiveDocumentId: document.effectiveDocumentId
})

const collectManagedDestinationOverwriteContexts = async rootPath => {
  const managedDocuments = await collectManagedMarkdownDescendants(rootPath)
  return managedDocuments.map(normalizeManagedDocumentToRollbackContext)
}

const collectDirectoryOverwriteContexts = async rootPath => {
  const [liveManagedContexts, staleSidecarOnlyContexts] = await Promise.all([
    collectManagedDestinationOverwriteContexts(rootPath),
    collectStaleManagedSidecarOnlyContexts(rootPath)
  ])
  const contextMap = new Map()

  for (const context of [...liveManagedContexts, ...staleSidecarOnlyContexts]) {
    const key = `${context.pathname}::${context.documentDir}`
    if (!contextMap.has(key)) {
      contextMap.set(key, context)
    }
  }

  return [...contextMap.values()]
}

const createPathRemaps = (pathnameList, oldRootPath, newRootPath) => {
  return pathnameList.map(src => ({
    src,
    dest: remapPathForMovedDirectory(src, oldRootPath, newRootPath)
  }))
}

const normalizeDocumentRecordForSave = (pathname, currentRecord, record) => ({
  ...DEFAULT_DOCUMENT_RECORD,
  ...currentRecord,
  ...record,
  lastKnownMarkdownPath: record.lastKnownMarkdownPath || currentRecord.lastKnownMarkdownPath || pathname,
  version: DOCUMENT_VERSION
})

export const createDocumentSaveRollbackContext = async (pathname, record = {}) => {
  pathname = resolveMarkdownFilePath(pathname)
  const previousRecord = await loadDocumentRecord(pathname)
  let embeddedDocumentId = ''
  try {
    const { loadMarkdownFile } = await import('../../filesystem/markdown')
    const rawDocument = await loadMarkdownFile(pathname, 'lf', true, 2)
    embeddedDocumentId = rawDocument.flowriteDocumentId || ''
  } catch (error) {}
  // If the existing markdown is unreadable, keep the requested documentId as a
  // rollback candidate so failed saves can restore the prior canonical index
  // owner for embedded-only documents instead of just deleting the new entry.
  const previousEffectiveDocumentId = previousRecord.documentId || embeddedDocumentId || record.documentId || ''
  const previousIndexEntry = previousEffectiveDocumentId
    ? await findDocumentIndexEntry(previousEffectiveDocumentId)
    : null

  return {
    pathname,
    documentDir: getSidecarPaths(pathname).documentDir,
    previousRecord,
    previousEffectiveDocumentId,
    previousIndexEntry,
    nextRecord: normalizeDocumentRecordForSave(pathname, previousRecord, record)
  }
}

export const rollbackDocumentIndexAfterFailedSave = async ({
  pathname,
  documentDir,
  previousRecord,
  previousEffectiveDocumentId = '',
  previousIndexEntry,
  nextRecord
} = {}) => {
  if (!nextRecord || !nextRecord.documentId) {
    return
  }

  if (!previousIndexEntry) {
    await removeDocumentIndexEntry({
      documentId: nextRecord.documentId,
      pathname: nextRecord.lastKnownMarkdownPath || pathname || '',
      documentDir: documentDir || ''
    })
    return
  }

  const restoredPathname = previousIndexEntry.pathname || previousRecord.lastKnownMarkdownPath || pathname || ''
  const restoredDocumentDir = previousIndexEntry.documentDir ||
    getSidecarPaths(previousRecord.lastKnownMarkdownPath || pathname).documentDir
  const restoredDocumentId = previousRecord.documentId || previousEffectiveDocumentId || nextRecord.documentId

  if (restoredDocumentId === nextRecord.documentId) {
    await rememberDocumentIndexEntry({
      documentId: restoredDocumentId,
      pathname: restoredPathname,
      documentDir: restoredDocumentDir
    })
    return
  }

  await replaceDocumentIndexEntry({
    previousDocumentId: nextRecord.documentId,
    previousPathname: nextRecord.lastKnownMarkdownPath || pathname || '',
    previousDocumentDir: documentDir || '',
    documentId: restoredDocumentId,
    pathname: restoredPathname,
    documentDir: restoredDocumentDir
  })
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
  const nextRecord = normalizeDocumentRecordForSave(pathname, previousRecord, record)

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

const createMoveDocumentIdentityRollbackContext = async (pathname, {
  tolerateUnreadableMarkdown = false
} = {}) => {
  const resolvedPathname = resolveMarkdownFilePath(pathname)
  const { documentDir } = getSidecarPaths(resolvedPathname)
  const { loadMarkdownFile } = await import('../../filesystem/markdown')
  const previousRecord = await loadDocumentRecord(resolvedPathname)
  const hadDocumentDir = await fs.pathExists(documentDir)
  let rawDocument = null

  try {
    rawDocument = await loadMarkdownFile(resolvedPathname, 'lf', true, 2)
  } catch (error) {
    if (!tolerateUnreadableMarkdown || (!hadDocumentDir && !previousRecord.documentId)) {
      throw error
    }
  }

  const embeddedDocumentId = rawDocument ? rawDocument.flowriteDocumentId || '' : ''
  const effectiveDocumentId = previousRecord.documentId || embeddedDocumentId

  return {
    pathname: resolvedPathname,
    documentDir,
    hadDocumentDir,
    previousRecord,
    previousIndexEntry: effectiveDocumentId
      ? await findDocumentIndexEntry(effectiveDocumentId)
      : null,
    effectiveDocumentId
  }
}

const restoreMovedDocumentIdentityAfterRollback = async (pathname, rollbackContext = {}) => {
  const resolvedPathname = resolveMarkdownFilePath(pathname)
  const { documentDir } = getSidecarPaths(resolvedPathname)
  const {
    previousRecord = DEFAULT_DOCUMENT_RECORD,
    previousIndexEntry = null,
    hadDocumentDir = false,
    effectiveDocumentId = ''
  } = rollbackContext

  if (!effectiveDocumentId) {
    if (hadDocumentDir) {
      await saveDocumentRecord(resolvedPathname, {
        ...previousRecord,
        lastKnownMarkdownPath: previousRecord.lastKnownMarkdownPath || resolvedPathname
      })
    }
    return
  }

  if (!hadDocumentDir && !previousRecord.documentId) {
    if (await fs.pathExists(documentDir)) {
      await fs.remove(documentDir)
    }
    if (previousIndexEntry) {
      await rememberDocumentIndexEntry({
        documentId: effectiveDocumentId,
        pathname: previousIndexEntry.pathname || resolvedPathname,
        documentDir: previousIndexEntry.documentDir || documentDir
      })
    } else {
      await removeDocumentIndexEntry({
        documentId: effectiveDocumentId
      })
    }
    return
  }

  await saveDocumentRecord(resolvedPathname, {
    ...previousRecord,
    documentId: previousRecord.documentId || effectiveDocumentId,
    lastKnownMarkdownPath: previousRecord.lastKnownMarkdownPath || resolvedPathname
  })

  if (!sourceOwnsDocumentIdentity(rollbackContext) && previousIndexEntry) {
    await rememberDocumentIndexEntry({
      documentId: effectiveDocumentId,
      pathname: previousIndexEntry.pathname || resolvedPathname,
      documentDir: previousIndexEntry.documentDir || documentDir
    })
  }
}

const cleanupOverwrittenDocumentIndexEntry = async ({
  overwrittenRollbackContext = null,
  replacementDocumentId = ''
} = {}) => {
  const overwrittenDocumentId = overwrittenRollbackContext && overwrittenRollbackContext.effectiveDocumentId
  const overwrittenPathname = overwrittenRollbackContext && overwrittenRollbackContext.pathname
  const overwrittenDocumentDir = overwrittenRollbackContext && overwrittenRollbackContext.documentDir

  if (!overwrittenDocumentId || overwrittenDocumentId === replacementDocumentId) {
    return false
  }

  return removeDocumentIndexEntry({
    documentId: overwrittenDocumentId,
    pathname: overwrittenPathname || '',
    documentDir: overwrittenDocumentDir || ''
  })
}

const sourceOwnsDocumentIdentity = rollbackContext => {
  if (!rollbackContext || !rollbackContext.effectiveDocumentId) {
    return false
  }

  const previousIndexEntry = rollbackContext.previousIndexEntry
  return Boolean(
    previousIndexEntry &&
    previousIndexEntry.pathname === rollbackContext.pathname &&
    previousIndexEntry.documentDir === rollbackContext.documentDir
  )
}

const resolveLiveCanonicalDocumentOwner = async ({
  documentId,
  rollbackContext = null,
  preferredOwner = null
} = {}) => {
  if (preferredOwner && preferredOwner.pathname && (!rollbackContext || preferredOwner.pathname !== rollbackContext.pathname)) {
    return preferredOwner
  }

  if (!documentId || !rollbackContext || !rollbackContext.previousIndexEntry || !rollbackContext.previousIndexEntry.pathname) {
    return null
  }

  const { loadMarkdownFile } = await import('../../filesystem/markdown')
  const liveCanonicalPath = await resolveLiveDocumentIdentityPath({
    candidatePath: rollbackContext.previousIndexEntry.pathname,
    documentId,
    loadMarkdownFile
  })

  if (!liveCanonicalPath || liveCanonicalPath === rollbackContext.pathname) {
    return null
  }

  return {
    pathname: liveCanonicalPath,
    documentDir: rollbackContext.previousIndexEntry.documentDir ||
      getSidecarPaths(liveCanonicalPath).documentDir
  }
}

const syncMovedDocumentIdentity = async (pathname, {
  sourceRollbackContext = null,
  preferredCanonicalOwner = null
} = {}) => {
  const resolvedPathname = resolveMarkdownFilePath(pathname)
  const { documentFile, documentDir } = getSidecarPaths(resolvedPathname)
  const identityState = await createMoveDocumentIdentityRollbackContext(resolvedPathname, {
    tolerateUnreadableMarkdown: true
  })
  const documentRecord = identityState.previousRecord
  const nextDocumentId = identityState.effectiveDocumentId

  if (!nextDocumentId) {
    if ((identityState.hadDocumentDir || await fs.pathExists(documentFile)) && documentRecord.lastKnownMarkdownPath !== resolvedPathname) {
      await saveDocumentRecord(resolvedPathname, {
        ...documentRecord,
        lastKnownMarkdownPath: resolvedPathname
      })
    }
    return
  }

  const shouldRebindIndexOwnership = sourceOwnsDocumentIdentity(sourceRollbackContext) ||
    !await resolveLiveCanonicalDocumentOwner({
      documentId: nextDocumentId,
      rollbackContext: sourceRollbackContext,
      preferredOwner: preferredCanonicalOwner
    })

  if (!await fs.pathExists(documentFile) || documentRecord.lastKnownMarkdownPath !== resolvedPathname || documentRecord.documentId !== nextDocumentId) {
    await saveDocumentRecord(resolvedPathname, {
      ...documentRecord,
      documentId: nextDocumentId,
      lastKnownMarkdownPath: resolvedPathname
    })
    if (!shouldRebindIndexOwnership && sourceRollbackContext && sourceRollbackContext.previousIndexEntry) {
      await rememberDocumentIndexEntry({
        documentId: nextDocumentId,
        pathname: sourceRollbackContext.previousIndexEntry.pathname || '',
        documentDir: sourceRollbackContext.previousIndexEntry.documentDir || ''
      })
    }
    return
  }

  if (!shouldRebindIndexOwnership) {
    return
  }

  await rememberDocumentIndexEntry({
    documentId: nextDocumentId,
    pathname: resolvedPathname,
    documentDir
  })
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
  const cleanupRoot = sourceHasSidecars ? oldPaths.flowriteRoot : newPaths.flowriteRoot

  try {
    if (!sourceHasSidecars) {
      await cleanupBackupBestEffort(
        destinationBackup,
        `Flowrite destination sidecar backup for "${newPathname}"`
      )
      await cleanupFlowriteRootIfEmptyBestEffort(
        cleanupRoot,
        `Flowrite sidecar root "${cleanupRoot}"`
      )
      return newPaths
    }

    await fs.move(oldPaths.documentDir, newPaths.documentDir, { overwrite: false })
  } catch (error) {
    if (await fs.pathExists(newPaths.documentDir)) {
      await fs.move(newPaths.documentDir, oldPaths.documentDir, { overwrite: false })
    }
    await restoreBackup(destinationBackup, newPaths.documentDir)
    throw error
  }

  await cleanupBackupBestEffort(
    destinationBackup,
    `Flowrite destination sidecar backup for "${newPathname}"`
  )
  await cleanupFlowriteRootIfEmptyBestEffort(
    cleanupRoot,
    `Flowrite sidecar root "${cleanupRoot}"`
  )
  return newPaths
}

export const moveDocumentWithSidecars = async (oldPathname, newPathname, { allowOverwrite = false } = {}) => {
  oldPathname = resolveMarkdownFilePath(oldPathname)
  newPathname = resolveMarkdownFilePath(newPathname)
  if (oldPathname === newPathname) {
    return
  }

  await fs.ensureDir(path.dirname(newPathname))
  if (await fs.pathExists(newPathname) && (await fs.stat(newPathname)).isDirectory()) {
    throw new Error(`Destination is a directory: ${newPathname}`)
  }
  const moveIdentityRollbackContext = await createMoveDocumentIdentityRollbackContext(oldPathname, {
    tolerateUnreadableMarkdown: true
  })
  const overwrittenDestinationPaths = getSidecarPaths(newPathname)
  const hasDestinationMarkdown = await fs.pathExists(newPathname)
  const hasDestinationSidecars = await fs.pathExists(overwrittenDestinationPaths.documentDir)
  const shouldHandleOverwrittenDestination = allowOverwrite || (!hasDestinationMarkdown && hasDestinationSidecars)

  if (!allowOverwrite && hasDestinationMarkdown) {
    throw new Error(`Destination already exists: ${newPathname}`)
  }

  let overwrittenDestinationRollbackContext = null
  let destinationMarkdownBackup = null
  let overwrittenDestinationSidecarBackup = null
  let didMigrateSidecars = false
  let didSyncMovedIdentity = false
  let didCleanupOverwrittenDocumentIndexEntry = false

  try {
    if (shouldHandleOverwrittenDestination && (hasDestinationMarkdown || hasDestinationSidecars)) {
      overwrittenDestinationRollbackContext = await createMoveDocumentIdentityRollbackContext(newPathname, {
        tolerateUnreadableMarkdown: true
      })
    }

    if (allowOverwrite || hasDestinationMarkdown) {
      destinationMarkdownBackup = await movePathToBackup(newPathname)
    }
    if (shouldHandleOverwrittenDestination) {
      overwrittenDestinationSidecarBackup = await movePathToBackup(overwrittenDestinationPaths.documentDir)
    }
  } catch (error) {
    await restoreBackup(overwrittenDestinationSidecarBackup, overwrittenDestinationPaths.documentDir)
    await restoreBackup(destinationMarkdownBackup, newPathname)
    throw error
  }

  try {
    await fs.move(oldPathname, newPathname, { overwrite: false })
    await migrateSidecarDirectory(oldPathname, newPathname)
    didMigrateSidecars = true
    await syncMovedDocumentIdentity(newPathname, {
      sourceRollbackContext: moveIdentityRollbackContext
    })
    didSyncMovedIdentity = true
    didCleanupOverwrittenDocumentIndexEntry = await cleanupOverwrittenDocumentIndexEntry({
      overwrittenRollbackContext: overwrittenDestinationRollbackContext,
      replacementDocumentId: moveIdentityRollbackContext.effectiveDocumentId
    })
  } catch (error) {
    if (didMigrateSidecars) {
      try {
        await migrateSidecarDirectory(newPathname, oldPathname)
      } catch (rollbackError) {
        log.warn(`Flowrite sidecar rollback failed while restoring "${newPathname}" to "${oldPathname}".`, rollbackError)
      }
    }
    if (await fs.pathExists(newPathname)) {
      await fs.move(newPathname, oldPathname, { overwrite: false })
    }
    await restoreBackup(destinationMarkdownBackup, newPathname)
    await restoreBackup(overwrittenDestinationSidecarBackup, overwrittenDestinationPaths.documentDir)
    if (didSyncMovedIdentity) {
      try {
        await restoreMovedDocumentIdentityAfterRollback(oldPathname, moveIdentityRollbackContext)
      } catch (rollbackError) {
        log.warn(`Flowrite source identity rollback failed while restoring "${newPathname}" to "${oldPathname}".`, rollbackError)
      }
    }
    if (didCleanupOverwrittenDocumentIndexEntry) {
      try {
        await restoreMovedDocumentIdentityAfterRollback(newPathname, overwrittenDestinationRollbackContext)
      } catch (rollbackError) {
        log.warn(`Flowrite overwritten destination rollback failed while restoring "${newPathname}".`, rollbackError)
      }
    }
    throw error
  }

  await cleanupBackupBestEffort(
    overwrittenDestinationSidecarBackup,
    `Flowrite overwritten destination sidecar backup for "${newPathname}"`
  )
  await cleanupFlowriteRootIfEmptyBestEffort(
    overwrittenDestinationPaths.flowriteRoot,
    `Flowrite overwritten destination sidecar root "${overwrittenDestinationPaths.flowriteRoot}"`
  )
  await cleanupBackupBestEffort(
    destinationMarkdownBackup,
    `Markdown destination backup for "${newPathname}"`
  )
}

const rollbackProcessedDirectoryMoveDocuments = async (processedDocuments, oldRootPath, newRootPath) => {
  for (const document of [...processedDocuments].reverse()) {
    const {
      relocatedOldDocumentDir,
      newDocumentDir,
      hadDocumentDir,
      targetBackup
    } = document

    if (hadDocumentDir && relocatedOldDocumentDir !== newDocumentDir && await fs.pathExists(newDocumentDir)) {
      await fs.move(newDocumentDir, relocatedOldDocumentDir, { overwrite: false })
    } else if (!hadDocumentDir && await fs.pathExists(newDocumentDir)) {
      await fs.remove(newDocumentDir)
    }

    await restoreBackup(targetBackup, newDocumentDir)
  }

  await fs.move(newRootPath, oldRootPath, { overwrite: false })

  for (const document of processedDocuments) {
    await restoreMovedDocumentIdentityAfterRollback(
      document.oldPathname,
      normalizeManagedDocumentToRollbackContext(document)
    )
  }
}

const cleanupProcessedDirectoryMoveBackups = async processedDocuments => {
  for (const document of processedDocuments) {
    await cleanupBackupBestEffort(
      document.targetBackup,
      `Flowrite moved document backup for "${document.newPathname}"`
    )
  }
}

const createDirectoryMoveOwnershipPlan = ({ managedDocuments, oldRootPath, newRootPath }) => {
  const ownershipPlan = new Map()

  for (const document of managedDocuments) {
    if (!document.effectiveDocumentId || !sourceOwnsDocumentIdentity(normalizeManagedDocumentToRollbackContext(document))) {
      continue
    }

    if (!ownershipPlan.has(document.effectiveDocumentId)) {
      const pathname = remapPathForMovedDirectory(document.oldPathname, oldRootPath, newRootPath)
      ownershipPlan.set(document.effectiveDocumentId, {
        pathname,
        documentDir: getSidecarPaths(pathname).documentDir
      })
    }
  }

  return ownershipPlan
}

const updateMovedDirectoryDocumentIdentities = async ({ oldRootPath, newRootPath, managedDocuments, ownershipPlan }) => {
  const processedDocuments = []

  for (const document of managedDocuments) {
    const newPathname = remapPathForMovedDirectory(document.oldPathname, oldRootPath, newRootPath)
    const relocatedOldDocumentDir = remapPathForMovedDirectory(document.oldDocumentDir, oldRootPath, newRootPath)
    const newDocumentDir = getSidecarPaths(newPathname).documentDir
    const targetBackup = await movePathToBackup(newDocumentDir)

    try {
      if (document.hadDocumentDir && relocatedOldDocumentDir !== newDocumentDir && await fs.pathExists(relocatedOldDocumentDir)) {
        await fs.ensureDir(path.dirname(newDocumentDir))
        await fs.move(relocatedOldDocumentDir, newDocumentDir, { overwrite: false })
      }

      const nextDocumentId = document.effectiveDocumentId
      const nextRecord = (nextDocumentId || document.hadDocumentDir)
        ? {
          ...document.oldRecord,
          ...(nextDocumentId ? { documentId: nextDocumentId } : {}),
          lastKnownMarkdownPath: newPathname
        }
        : null
      await syncMovedDocumentIdentity(newPathname, {
        sourceRollbackContext: {
          pathname: document.oldPathname,
          documentDir: document.oldDocumentDir,
          hadDocumentDir: document.hadDocumentDir,
          previousRecord: document.oldRecord,
          previousIndexEntry: document.previousIndexEntry,
          effectiveDocumentId: document.effectiveDocumentId
        },
        preferredCanonicalOwner: nextDocumentId
          ? ownershipPlan.get(nextDocumentId) || null
          : null
      })

      processedDocuments.push({
        ...document,
        newPathname,
        relocatedOldDocumentDir,
        newDocumentDir,
        nextRecord,
        targetBackup
      })
    } catch (error) {
      if (document.hadDocumentDir && relocatedOldDocumentDir !== newDocumentDir && await fs.pathExists(newDocumentDir)) {
        await fs.move(newDocumentDir, relocatedOldDocumentDir, { overwrite: false })
      } else if (!document.hadDocumentDir && await fs.pathExists(newDocumentDir)) {
        await fs.remove(newDocumentDir)
      }
      await restoreBackup(targetBackup, newDocumentDir)
      error.processedDocuments = processedDocuments
      throw error
    }
  }

  return processedDocuments
}

const moveDirectoryWithFlowriteIdentity = async (src, dest, { allowOverwrite = false } = {}) => {
  const markdownPathRemaps = createPathRemaps(await listMarkdownDescendants(src), src, dest)
  const managedDocuments = await collectManagedMarkdownDescendants(src)
  const ownershipPlan = createDirectoryMoveOwnershipPlan({
    managedDocuments,
    oldRootPath: src,
    newRootPath: dest
  })
  const replacementDocumentIds = new Set(
    managedDocuments
      .map(document => document.effectiveDocumentId)
      .filter(Boolean)
  )
  const overwrittenDestinationContexts = allowOverwrite && await fs.pathExists(dest)
    ? await collectDirectoryOverwriteContexts(dest)
    : []
  const destinationBackup = allowOverwrite
    ? await movePathToBackup(dest)
    : null
  let cleanedOverwrittenDestinationContexts = []

  if (managedDocuments.length === 0) {
    try {
      await fs.move(src, dest, { overwrite: false })
      for (const context of overwrittenDestinationContexts) {
        if (replacementDocumentIds.has(context.effectiveDocumentId)) {
          continue
        }
        if (await cleanupOverwrittenDocumentIndexEntry({
          overwrittenRollbackContext: context,
          replacementDocumentId: ''
        })) {
          cleanedOverwrittenDestinationContexts.push(context)
        }
      }
      await cleanupBackupBestEffort(
        destinationBackup,
        `Flowrite overwritten directory backup for "${dest}"`
      )
      return {
        src,
        dest,
        pathRemaps: markdownPathRemaps
      }
    } catch (error) {
      if (await fs.pathExists(dest) && !await fs.pathExists(src)) {
        await fs.move(dest, src, { overwrite: false })
      }
      await restoreBackup(destinationBackup, dest)
      for (const context of cleanedOverwrittenDestinationContexts) {
        await restoreMovedDocumentIdentityAfterRollback(context.pathname, context)
      }
      throw error
    }
  }

  let processedDocuments = []

  try {
    await fs.move(src, dest, { overwrite: false })
    processedDocuments = await updateMovedDirectoryDocumentIdentities({
      oldRootPath: src,
      newRootPath: dest,
      managedDocuments,
      ownershipPlan
    })
    for (const context of overwrittenDestinationContexts) {
      if (replacementDocumentIds.has(context.effectiveDocumentId)) {
        continue
      }
      if (await cleanupOverwrittenDocumentIndexEntry({
        overwrittenRollbackContext: context,
        replacementDocumentId: ''
      })) {
        cleanedOverwrittenDestinationContexts.push(context)
      }
    }
    await cleanupProcessedDirectoryMoveBackups(processedDocuments)
    await cleanupBackupBestEffort(
      destinationBackup,
      `Flowrite overwritten directory backup for "${dest}"`
    )
    return {
      src,
      dest,
      pathRemaps: markdownPathRemaps
    }
  } catch (error) {
    processedDocuments = error.processedDocuments || processedDocuments
    if (await fs.pathExists(dest) && !await fs.pathExists(src)) {
      if (processedDocuments.length > 0) {
        await rollbackProcessedDirectoryMoveDocuments(processedDocuments, src, dest)
      } else {
        await fs.move(dest, src, { overwrite: false })
      }
    }
    await restoreBackup(destinationBackup, dest)
    for (const context of cleanedOverwrittenDestinationContexts) {
      await restoreMovedDocumentIdentityAfterRollback(context.pathname, context)
    }
    throw error
  }
}

export const moveFileSystemItemWithFlowriteIdentity = async (src, dest, { allowOverwrite = false } = {}) => {
  if (!src || !dest) {
    throw new Error('Source and destination path are required.')
  }

  const sourceExists = await fs.pathExists(src)
  const sourceStats = sourceExists ? await fs.stat(src) : null
  const isDirectory = Boolean(sourceStats && sourceStats.isDirectory())
  const isMarkdownDocument = Boolean(sourceStats && sourceStats.isFile() && isMarkdownFile(src))

  if (isDirectory) {
    return moveDirectoryWithFlowriteIdentity(src, dest, { allowOverwrite })
  }

  if (isMarkdownDocument) {
    const canonicalSrc = resolveMarkdownFilePath(src)
    const canonicalDest = resolveMarkdownFilePath(dest)
    await moveDocumentWithSidecars(canonicalSrc, canonicalDest, { allowOverwrite })
    return {
      src: canonicalSrc,
      dest: canonicalDest,
      pathRemaps: [{
        src: canonicalSrc,
        dest: canonicalDest
      }]
    }
  }

  await fs.move(src, dest, { overwrite: allowOverwrite })
  return {
    src,
    dest,
    pathRemaps: []
  }
}

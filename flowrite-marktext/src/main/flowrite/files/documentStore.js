import path from 'path'
import fs from 'fs-extra'
import log from 'electron-log'
import { getSidecarPaths } from './sidecarPaths'
import { resolveMarkdownFilePath } from '../../filesystem/markdownPaths'

const DOCUMENT_VERSION = 1

export const DEFAULT_DOCUMENT_RECORD = {
  version: DOCUMENT_VERSION,
  lastSnapshotSaveCycleId: null,
  conversationHistory: [],
  historyTokenEstimate: 0,
  responseStyle: 'comment_only',
  lastReviewPersona: 'improvement'
}

const isPlainObject = value => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
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

  const { documentFile } = getSidecarPaths(pathname)
  const nextRecord = {
    ...DEFAULT_DOCUMENT_RECORD,
    ...record,
    version: DOCUMENT_VERSION
  }

  await writeJsonSidecar(documentFile, nextRecord)
  return nextRecord
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

import path from 'path'
import fs from 'fs-extra'
import { isPlainObject } from '../../../flowrite/objectUtils'

let documentIndexRoot = ''
let tempFileSequence = 0
let documentIndexWriteQueue = Promise.resolve()

const getTempFilePath = pathname => {
  const parsed = path.parse(pathname)
  tempFileSequence += 1
  return path.join(parsed.dir, `.${parsed.base}.${process.pid}.${Date.now()}.${tempFileSequence}.tmp`)
}

const getDocumentIndexPath = () => {
  if (!documentIndexRoot) {
    return ''
  }
  return path.join(documentIndexRoot, 'flowrite', 'document-index.json')
}

const loadDocumentIndex = async () => {
  const indexPath = getDocumentIndexPath()
  if (!indexPath || !await fs.pathExists(indexPath)) {
    return {}
  }

  try {
    const index = await fs.readJson(indexPath)
    return isPlainObject(index) ? index : {}
  } catch (error) {
    return {}
  }
}

const persistDocumentIndex = async index => {
  const indexPath = getDocumentIndexPath()
  if (!indexPath) {
    return
  }

  const tempPath = getTempFilePath(indexPath)
  await fs.ensureDir(path.dirname(indexPath))
  await fs.writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  await fs.move(tempPath, indexPath, { overwrite: true })
}

const enqueueDocumentIndexWrite = operation => {
  const nextWrite = documentIndexWriteQueue.then(operation)
  documentIndexWriteQueue = nextWrite.catch(() => {})
  return nextWrite
}

const writeDocumentIndex = async mutateIndex => {
  return enqueueDocumentIndexWrite(async () => {
    const index = await loadDocumentIndex()
    const nextIndex = await mutateIndex(index)
    await persistDocumentIndex(nextIndex)
    return nextIndex
  })
}

export const configureDocumentIndex = ({ rootPath } = {}) => {
  documentIndexRoot = rootPath ? path.resolve(rootPath) : ''
}

export const rememberDocumentIndexEntry = async ({
  documentId,
  pathname,
  documentDir
} = {}) => {
  if (!documentId) {
    return null
  }

  let nextEntry = null
  await writeDocumentIndex(async index => {
    const entry = {
      pathname: pathname || '',
      documentDir: documentDir || '',
      updatedAt: new Date().toISOString()
    }
    nextEntry = entry

    return {
      ...index,
      [documentId]: entry
    }
  })
  return nextEntry
}

export const removeDocumentIndexEntry = async ({
  documentId,
  pathname,
  documentDir
} = {}) => {
  if (!documentId) {
    return false
  }

  let didRemove = false
  await writeDocumentIndex(async index => {
    const entry = index[documentId]
    if (!isPlainObject(entry)) {
      return index
    }

    const pathnameMatches = pathname === undefined || pathname === '' || entry.pathname === pathname
    const documentDirMatches = documentDir === undefined || documentDir === '' || entry.documentDir === documentDir
    if (!pathnameMatches || !documentDirMatches) {
      return index
    }

    didRemove = true
    const nextIndex = { ...index }
    delete nextIndex[documentId]
    return nextIndex
  })
  return didRemove
}

export const replaceDocumentIndexEntry = async ({
  previousDocumentId,
  previousPathname,
  previousDocumentDir,
  documentId,
  pathname,
  documentDir
} = {}) => {
  if (!previousDocumentId && !documentId) {
    return null
  }

  let nextEntry = null
  await writeDocumentIndex(async index => {
    const nextIndex = { ...index }

    if (previousDocumentId && previousDocumentId !== documentId) {
      const previousEntry = nextIndex[previousDocumentId]
      if (isPlainObject(previousEntry)) {
        const pathnameMatches = !previousPathname || previousEntry.pathname === previousPathname
        const documentDirMatches = !previousDocumentDir || previousEntry.documentDir === previousDocumentDir
        if (pathnameMatches && documentDirMatches) {
          delete nextIndex[previousDocumentId]
        }
      }
    }

    if (documentId) {
      nextEntry = {
        pathname: pathname || '',
        documentDir: documentDir || '',
        updatedAt: new Date().toISOString()
      }
      nextIndex[documentId] = nextEntry
    }

    return nextIndex
  })

  return nextEntry
}

export const findDocumentIndexEntry = async documentId => {
  if (!documentId) {
    return null
  }

  const index = await loadDocumentIndex()
  const entry = index[documentId]
  return isPlainObject(entry) ? entry : null
}

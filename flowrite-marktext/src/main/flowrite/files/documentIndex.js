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

  return enqueueDocumentIndexWrite(async () => {
    const index = await loadDocumentIndex()
    const entry = {
      pathname: pathname || '',
      documentDir: documentDir || '',
      updatedAt: new Date().toISOString()
    }

    await persistDocumentIndex({
      ...index,
      [documentId]: entry
    })

    return entry
  })
}

export const findDocumentIndexEntry = async documentId => {
  if (!documentId) {
    return null
  }

  const index = await loadDocumentIndex()
  const entry = index[documentId]
  return isPlainObject(entry) ? entry : null
}

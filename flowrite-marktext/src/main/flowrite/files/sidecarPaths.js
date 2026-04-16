import crypto from 'crypto'
import path from 'path'

const slugify = value => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'untitled'
}

const getPathHashInput = pathname => {
  const normalized = path.resolve(pathname)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

const SIDECAR_PATH_CACHE = new Map()

export const getSidecarPaths = pathname => {
  const resolvedPath = path.resolve(pathname)
  const cacheKey = getPathHashInput(resolvedPath)
  if (SIDECAR_PATH_CACHE.has(cacheKey)) {
    return SIDECAR_PATH_CACHE.get(cacheKey)
  }

  const dirname = path.dirname(resolvedPath)
  const basename = path.basename(resolvedPath, path.extname(resolvedPath))
  const documentSlug = slugify(basename)
  const pathHash = crypto
    .createHash('sha1')
    .update(cacheKey)
    .digest('hex')
    .slice(0, 12)
  const flowriteRoot = path.join(dirname, '.flowrite')
  const documentDir = path.join(flowriteRoot, `${documentSlug}-${pathHash}`)

  const paths = {
    resolvedPath,
    flowriteRoot,
    documentSlug,
    pathHash,
    documentDir,
    documentFile: path.join(documentDir, 'document.json'),
    commentsFile: path.join(documentDir, 'comments.json'),
    suggestionsFile: path.join(documentDir, 'suggestions.json'),
    snapshotsDir: path.join(documentDir, 'snapshots')
  }

  SIDECAR_PATH_CACHE.set(cacheKey, paths)
  return paths
}

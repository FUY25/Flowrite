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

export const getSidecarPaths = pathname => {
  const resolvedPath = path.resolve(pathname)
  const dirname = path.dirname(resolvedPath)
  const basename = path.basename(resolvedPath, path.extname(resolvedPath))
  const documentSlug = slugify(basename)
  const pathHash = crypto
    .createHash('sha1')
    .update(getPathHashInput(resolvedPath))
    .digest('hex')
    .slice(0, 12)
  const flowriteRoot = path.join(dirname, '.flowrite')
  const documentDir = path.join(flowriteRoot, `${documentSlug}-${pathHash}`)

  return {
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
}

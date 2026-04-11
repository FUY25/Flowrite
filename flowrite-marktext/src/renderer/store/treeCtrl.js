import path from 'path'
import { getUniqueId } from '../util'
import { PATH_SEPARATOR } from '../config'

const compareByName = (left, right) => {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

const toTimestamp = value => {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export const sortFoldersForSidebar = (folders, sortBy = 'created') => {
  const sortedFolders = [...folders]
  sortedFolders.sort((left, right) => {
    if (sortBy === 'modified') {
      const difference = toTimestamp(right.modifiedTime) - toTimestamp(left.modifiedTime)
      if (difference !== 0) return difference
    } else if (sortBy === 'created') {
      const difference = toTimestamp(right.birthTime) - toTimestamp(left.birthTime)
      if (difference !== 0) return difference
    } else {
      const difference = compareByName(left, right)
      if (difference !== 0) return difference
    }

    return compareByName(left, right)
  })

  return sortedFolders
}

export const sortFilesForSidebar = (files, sortBy = 'created') => {
  const sortedFiles = [...files]
  sortedFiles.sort((left, right) => {
    if (sortBy === 'modified') {
      const difference = toTimestamp(right.modifiedTime) - toTimestamp(left.modifiedTime)
      if (difference !== 0) return difference
    } else if (sortBy === 'created') {
      const difference = toTimestamp(right.birthTime) - toTimestamp(left.birthTime)
      if (difference !== 0) return difference
    } else {
      const difference = compareByName(left, right)
      if (difference !== 0) return difference
    }

    return compareByName(left, right)
  })

  return sortedFiles
}

/**
 * Return all sub-directories relative to the root directory.
 *
 * @param {string} rootPath Root directory path
 * @param {string} pathname Full directory path
 * @returns {Array<string>} Sub-directories relative to root.
 */
const getSubdirectoriesFromRoot = (rootPath, pathname) => {
  if (!path.isAbsolute(pathname)) {
    throw new Error('Invalid path!')
  }
  const relativePath = path.relative(rootPath, pathname)
  return relativePath ? relativePath.split(PATH_SEPARATOR) : []
}

/**
 * Add a new file to the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} file The file that should be added
 */
export const addFile = (tree, file) => {
  const { pathname, name } = file
  const dirname = path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentPath = tree.pathname
  let currentFolder = tree
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    let childFolder = currentSubFolders.find(f => f.name === directoryName)
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: `${currentPath}${PATH_SEPARATOR}${directoryName}`,
        name: directoryName,
        birthTime: null,
        modifiedTime: null,
        isCollapsed: true,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      currentSubFolders.push(childFolder)
    }

    currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  // Add file to related directory
  if (!currentFolder.files.find(f => f.name === name)) {
    // Remove file content from object.
    const fileCopy = {
      id: getUniqueId(),
      birthTime: file.birthTime,
      modifiedTime: file.modifiedTime,
      isDirectory: file.isDirectory,
      isFile: file.isFile,
      isMarkdown: file.isMarkdown,
      name: file.name,
      pathname: file.pathname
    }
    currentFolder.files.push(fileCopy)
  }
}

/**
 * Add a new directory to the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} dir The directory that should be added
 */
export const addDirectory = (tree, dir) => {
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dir.pathname)

  let currentPath = tree.pathname
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    let childFolder = currentSubFolders.find(f => f.name === directoryName)
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: `${currentPath}${PATH_SEPARATOR}${directoryName}`,
        name: directoryName,
        birthTime: dir.birthTime || null,
        modifiedTime: dir.modifiedTime || null,
        isCollapsed: true,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      currentSubFolders.push(childFolder)
    }

    currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`
    currentSubFolders = childFolder.folders
  }
}

/**
 * Remove the given file from the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} file The file that should be deleted
 */
export const unlinkFile = (tree, file) => {
  const { pathname } = file
  const dirname = path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentFolder = tree
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    const childFolder = currentSubFolders.find(f => f.name === directoryName)
    if (!childFolder) return
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  const index = currentFolder.files.findIndex(f => f.pathname === pathname)
  if (index !== -1) {
    currentFolder.files.splice(index, 1)
  }
}

/**
 * Remove the given directory from the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} dir The directory that should be deleted
 */
export const unlinkDirectory = (tree, dir) => {
  const { pathname } = dir
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, pathname)

  subDirectories.pop()
  let currentFolder = tree.folders
  for (const directoryName of subDirectories) {
    const childFolder = currentFolder.find(f => f.name === directoryName)
    if (!childFolder) return
    currentFolder = childFolder.folders
  }

  const index = currentFolder.findIndex(f => f.pathname === pathname)
  if (index !== -1) {
    currentFolder.splice(index, 1)
  }
}

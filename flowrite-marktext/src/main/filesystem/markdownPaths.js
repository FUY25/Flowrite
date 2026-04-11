import path from 'path'

export const resolveMarkdownFilePath = pathname => {
  const extension = path.extname(pathname) || '.md'
  return !extension || pathname.endsWith(extension) ? path.resolve(pathname) : path.resolve(`${pathname}${extension}`)
}

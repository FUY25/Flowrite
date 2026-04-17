import crypto from 'crypto'

const DOCUMENT_ID_COMMENT_REG = /^<!--\s*flowrite:id=([0-9a-z-]+)\s*-->(?:\r?\n){0,2}/i

export const createDocumentId = () => crypto.randomUUID()

export const extractDocumentIdentityFromMarkdown = markdown => {
  const source = typeof markdown === 'string' ? markdown : ''
  const match = source.match(DOCUMENT_ID_COMMENT_REG)

  if (!match) {
    return {
      markdown: source,
      documentId: '',
      carrier: null
    }
  }

  return {
    markdown: source.replace(DOCUMENT_ID_COMMENT_REG, ''),
    documentId: match[1],
    carrier: 'html_comment'
  }
}

export const ensureDocumentIdentityInMarkdown = (markdown, documentId, lineEnding = 'lf') => {
  const source = typeof markdown === 'string' ? markdown : ''
  const cleaned = source.replace(DOCUMENT_ID_COMMENT_REG, '')
  const eol = lineEnding && lineEnding.toLowerCase() === 'crlf' ? '\r\n' : '\n'
  return `<!-- flowrite:id=${documentId} -->${eol}${eol}${cleaned}`
}

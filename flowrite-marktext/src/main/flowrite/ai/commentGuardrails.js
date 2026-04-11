import { FLOWRITE_THREAD_MODE_COMMENTING } from '../../../flowrite/constants.js'

export const COMMENT_GUARDRAILS_REJECTION_REASON = 'Comment output became empty after removing unsupported markdown formatting.'

const stripHeadingMarkers = body => body.replace(/^\s{0,3}#{1,6}\s+/gm, '')

const stripBoldMarkers = body => body
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')

const stripItalicMarkers = body => body
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/gm, '$1$2')
  .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/gm, '$1$2')

const stripBlockquotes = body => body.replace(/^\s{0,3}>\s?/gm, '')

const stripFencedCodeBlocks = body => body.replace(/```[\s\S]*?```/g, '')

const stripTableRows = body => body
  .split('\n')
  .filter(line => !/^\s*\|.*\|\s*$/.test(line))
  .join('\n')

const collapseWhitespace = body => body
  .replace(/\n{3,}/g, '\n\n')
  .trim()

export const normalizeCommentBody = body => {
  const input = typeof body === 'string' ? body : ''

  return collapseWhitespace(
    stripTableRows(
      stripFencedCodeBlocks(
        stripBlockquotes(
          stripItalicMarkers(
            stripBoldMarkers(
              stripHeadingMarkers(input)
            )
          )
        )
      )
    )
  )
}

export const applyCommentGuardrails = ({
  body = '',
  threadMode = FLOWRITE_THREAD_MODE_COMMENTING
} = {}) => {
  if (threadMode !== FLOWRITE_THREAD_MODE_COMMENTING) {
    return {
      body: typeof body === 'string' ? body : '',
      rejected: false,
      reason: null
    }
  }

  const normalizedBody = normalizeCommentBody(body)
  if (!normalizedBody) {
    return {
      body: '',
      rejected: true,
      reason: COMMENT_GUARDRAILS_REJECTION_REASON
    }
  }

  return {
    body: normalizedBody,
    rejected: false,
    reason: null
  }
}

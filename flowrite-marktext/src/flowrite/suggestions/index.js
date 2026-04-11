import { cloneMarginAnchor, resolveMarginAnchor } from '../anchors'
import { ANCHOR_DETACHED } from '../constants'

const normalizeString = value => {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : ''
}

export const parseMarkdownParagraphs = markdown => {
  const content = typeof markdown === 'string' ? markdown : ''
  const paragraphs = []
  const matcher = /\n{2,}/g
  let startIndex = 0
  let match
  let index = 0

  while ((match = matcher.exec(content))) {
    const text = content.slice(startIndex, match.index)
    if (text.trim()) {
      paragraphs.push({
        id: `markdown-paragraph-${index}`,
        text,
        startIndex
      })
      index += 1
    }
    startIndex = match.index + match[0].length
  }

  const trailingText = content.slice(startIndex)
  if (trailingText.trim()) {
    paragraphs.push({
      id: `markdown-paragraph-${index}`,
      text: trailingText,
      startIndex
    })
  }

  return paragraphs
}

const findExactTargetRange = (markdown, suggestion) => {
  const targetText = typeof suggestion.targetText === 'string' && suggestion.targetText
    ? suggestion.targetText
    : (suggestion.anchor && suggestion.anchor.quote ? suggestion.anchor.quote : '')

  if (!targetText) {
    return null
  }

  const start = markdown.indexOf(targetText)
  if (start < 0) {
    return null
  }

  const nextMatch = markdown.indexOf(targetText, start + targetText.length)
  if (nextMatch >= 0) {
    return null
  }

  return {
    start,
    end: start + targetText.length,
    text: targetText,
    anchor: cloneMarginAnchor(suggestion.anchor),
    strategy: 'exact_target'
  }
}

export const resolveSuggestionTarget = (markdown, suggestion) => {
  const safeMarkdown = typeof markdown === 'string' ? markdown : ''
  const exactMatch = findExactTargetRange(safeMarkdown, suggestion)
  if (exactMatch) {
    return exactMatch
  }

  if (!suggestion || !suggestion.anchor) {
    return null
  }

  const paragraphs = parseMarkdownParagraphs(safeMarkdown)
  const resolvedAnchor = resolveMarginAnchor(suggestion.anchor, paragraphs)
  if (!resolvedAnchor || resolvedAnchor.status === ANCHOR_DETACHED) {
    return null
  }

  const paragraph = paragraphs.find(entry => entry.id === resolvedAnchor.paragraphId)
  if (!paragraph) {
    return null
  }

  return {
    start: paragraph.startIndex + resolvedAnchor.startOffset,
    end: paragraph.startIndex + resolvedAnchor.endOffset,
    text: paragraph.text.slice(resolvedAnchor.startOffset, resolvedAnchor.endOffset),
    anchor: cloneMarginAnchor({
      ...suggestion.anchor,
      resolution: resolvedAnchor
    }),
    strategy: resolvedAnchor.strategy || 'fuzzy'
  }
}

export const markdownContainsSuggestionText = (markdown, suggestion) => {
  const suggestedText = normalizeString(suggestion && suggestion.suggestedText)
  if (!suggestedText) {
    return false
  }

  return normalizeString(markdown).includes(suggestedText)
}

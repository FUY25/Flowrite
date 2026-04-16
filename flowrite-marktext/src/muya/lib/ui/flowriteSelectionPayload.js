export const buildFlowriteSelectionPayload = ({
  range,
  cursor,
  selectedQuote = '',
  getBlock = () => null,
  requireSingleParagraph = false
} = {}) => {
  const quote = typeof selectedQuote === 'string'
    ? selectedQuote.replace(/\s+/g, ' ').trim()
    : ''

  if (!range || range.collapsed || !cursor || !cursor.start || !cursor.end || !quote) {
    return null
  }

  if (requireSingleParagraph && cursor.start.key !== cursor.end.key) {
    return null
  }

  const rect = typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : null
  if (!rect || (!rect.width && !rect.height)) {
    return null
  }

  const startBlock = typeof getBlock === 'function' ? getBlock(cursor.start.key) : null
  const endBlock = typeof getBlock === 'function' ? getBlock(cursor.end.key) : null

  return {
    quote,
    rect: {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    },
    start: {
      key: cursor.start.key,
      offset: cursor.start.offset,
      blockText: startBlock && typeof startBlock.text === 'string' ? startBlock.text : ''
    },
    end: {
      key: cursor.end.key,
      offset: cursor.end.offset,
      blockText: endBlock && typeof endBlock.text === 'string' ? endBlock.text : ''
    },
    sameBlock: cursor.start.key === cursor.end.key
  }
}

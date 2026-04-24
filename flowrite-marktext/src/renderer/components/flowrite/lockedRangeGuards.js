const normalizeOffset = value => {
  const offset = Number.isFinite(value) ? value : Number(value)
  return Number.isFinite(offset) ? Math.max(0, offset) : 0
}

export const normalizeTextRange = range => {
  if (!range || typeof range.paragraphId !== 'string' || !range.paragraphId) {
    return null
  }

  const startOffset = normalizeOffset(range.startOffset)
  const endOffset = normalizeOffset(range.endOffset)

  if (startOffset <= endOffset) {
    return {
      paragraphId: range.paragraphId,
      startOffset,
      endOffset
    }
  }

  return {
    paragraphId: range.paragraphId,
    startOffset: endOffset,
    endOffset: startOffset
  }
}

export const normalizeTextRanges = ranges => {
  return Array.isArray(ranges)
    ? ranges.map(normalizeTextRange).filter(Boolean)
    : []
}

export const pointFallsWithinLockedRange = (point, lockedRange) => {
  const normalizedPoint = point && typeof point.paragraphId === 'string'
    ? {
      paragraphId: point.paragraphId,
      offset: normalizeOffset(point.offset)
    }
    : null
  const normalizedLockedRange = normalizeTextRange(lockedRange)

  if (!normalizedPoint || !normalizedLockedRange || normalizedPoint.paragraphId !== normalizedLockedRange.paragraphId) {
    return false
  }

  return normalizedPoint.offset >= normalizedLockedRange.startOffset &&
    normalizedPoint.offset < normalizedLockedRange.endOffset
}

export const rangesOverlap = (range, lockedRange) => {
  const normalizedRange = normalizeTextRange(range)
  const normalizedLockedRange = normalizeTextRange(lockedRange)

  if (!normalizedRange || !normalizedLockedRange || normalizedRange.paragraphId !== normalizedLockedRange.paragraphId) {
    return false
  }

  if (normalizedRange.startOffset === normalizedRange.endOffset) {
    return pointFallsWithinLockedRange({
      paragraphId: normalizedRange.paragraphId,
      offset: normalizedRange.startOffset
    }, normalizedLockedRange)
  }

  return normalizedRange.startOffset < normalizedLockedRange.endOffset &&
    normalizedLockedRange.startOffset < normalizedRange.endOffset
}

export const selectionOverlapsLockedRanges = (selectionRanges = [], lockedRanges = []) => {
  const normalizedSelectionRanges = normalizeTextRanges(selectionRanges)
  const normalizedLockedRanges = normalizeTextRanges(lockedRanges)

  return normalizedSelectionRanges.some(selectionRange => {
    return normalizedLockedRanges.some(lockedRange => rangesOverlap(selectionRange, lockedRange))
  })
}

export const isMutatingBeforeInputType = inputType => {
  if (typeof inputType !== 'string' || !inputType) {
    return true
  }

  return inputType.startsWith('insert') ||
    inputType.startsWith('delete') ||
    inputType.startsWith('history')
}

export const isKeyboardEditIntent = event => {
  if (!event || event.defaultPrevented || event.isComposing) {
    return false
  }

  if (event.metaKey || event.ctrlKey) {
    return false
  }

  const key = typeof event.key === 'string' ? event.key : ''
  if (!key) {
    return false
  }

  if (key === 'Backspace' || key === 'Delete' || key === 'Enter' || key === 'Tab') {
    return true
  }

  return key.length === 1
}

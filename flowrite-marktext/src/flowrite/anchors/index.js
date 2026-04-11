import { ANCHOR_ATTACHED, ANCHOR_DETACHED } from '../constants'

const DEFAULT_CONTEXT_RADIUS = 24
const MIN_FUZZY_SCORE = 0.72
const STRONG_FUZZY_SCORE = 0.84
const MIN_FUZZY_MARGIN = 0.08

const isPlainObject = value => value != null && typeof value === 'object' && !Array.isArray(value)

const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value))
}

const normalizeString = value => {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : ''
}

const createPoint = point => {
  if (!isPlainObject(point) || typeof point.key !== 'string') {
    return null
  }

  const offset = Number.isFinite(point.offset) ? point.offset : Number(point.offset)
  return {
    key: point.key,
    offset: Number.isFinite(offset) ? Math.max(0, offset) : 0
  }
}

const createParagraphEntry = paragraph => {
  if (!isPlainObject(paragraph) || typeof paragraph.id !== 'string') {
    return null
  }

  return {
    id: paragraph.id,
    text: typeof paragraph.text === 'string' ? paragraph.text : ''
  }
}

const createResolutionRange = range => {
  if (!isPlainObject(range) || typeof range.paragraphId !== 'string') {
    return null
  }

  const startOffset = Number.isFinite(range.startOffset) ? range.startOffset : Number(range.startOffset)
  const endOffset = Number.isFinite(range.endOffset) ? range.endOffset : Number(range.endOffset)

  return {
    paragraphId: range.paragraphId,
    startOffset: Number.isFinite(startOffset) ? Math.max(0, startOffset) : 0,
    endOffset: Number.isFinite(endOffset) ? Math.max(0, endOffset) : 0
  }
}

const cloneAnchorResolution = anchor => {
  if (!isPlainObject(anchor.resolution)) {
    return null
  }

  const ranges = Array.isArray(anchor.resolution.ranges)
    ? anchor.resolution.ranges.map(createResolutionRange).filter(Boolean)
    : []
  const paragraphId = typeof anchor.resolution.paragraphId === 'string' ? anchor.resolution.paragraphId : ''
  const startParagraphId = typeof anchor.resolution.startParagraphId === 'string'
    ? anchor.resolution.startParagraphId
    : (ranges[0] ? ranges[0].paragraphId : paragraphId)
  const endParagraphId = typeof anchor.resolution.endParagraphId === 'string'
    ? anchor.resolution.endParagraphId
    : (ranges.length ? ranges[ranges.length - 1].paragraphId : paragraphId)

  const resolution = {
    status: anchor.resolution.status === ANCHOR_DETACHED ? ANCHOR_DETACHED : ANCHOR_ATTACHED,
    paragraphId: paragraphId || startParagraphId || '',
    startParagraphId,
    endParagraphId,
    startOffset: Number.isFinite(anchor.resolution.startOffset) ? anchor.resolution.startOffset : 0,
    endOffset: Number.isFinite(anchor.resolution.endOffset) ? anchor.resolution.endOffset : 0,
    strategy: typeof anchor.resolution.strategy === 'string' ? anchor.resolution.strategy : '',
    score: Number.isFinite(anchor.resolution.score) ? anchor.resolution.score : 0
  }

  if (ranges.length) {
    resolution.ranges = ranges
  }

  return {
    ...resolution
  }
}

export const cloneMarginAnchor = anchor => {
  if (!isPlainObject(anchor)) {
    return null
  }

  return {
    version: 1,
    start: createPoint(anchor.start),
    end: createPoint(anchor.end),
    quote: normalizeString(anchor.quote),
    contextBefore: typeof anchor.contextBefore === 'string' ? anchor.contextBefore : '',
    contextAfter: typeof anchor.contextAfter === 'string' ? anchor.contextAfter : '',
    resolution: cloneAnchorResolution(anchor)
  }
}

export const createMarginAnchor = ({
  start,
  end,
  quote = '',
  startBlockText = '',
  endBlockText = ''
} = {}) => {
  const normalizedStart = createPoint(start)
  const normalizedEnd = createPoint(end)

  if (!normalizedStart || !normalizedEnd) {
    return null
  }

  const normalizedQuote = normalizeString(quote)
  const safeStartBlockText = typeof startBlockText === 'string' ? startBlockText : ''
  const safeEndBlockText = typeof endBlockText === 'string' ? endBlockText : safeStartBlockText
  const contextBefore = safeStartBlockText.slice(
    Math.max(0, normalizedStart.offset - DEFAULT_CONTEXT_RADIUS),
    normalizedStart.offset
  )
  const contextAfter = safeEndBlockText.slice(
    normalizedEnd.offset,
    normalizedEnd.offset + DEFAULT_CONTEXT_RADIUS
  )

  return cloneMarginAnchor({
    version: 1,
    start: normalizedStart,
    end: normalizedEnd,
    quote: normalizedQuote,
    contextBefore,
    contextAfter,
    resolution: null
  })
}

const buildDocumentSnapshot = paragraphs => {
  const entries = []
  const map = new Map()

  for (const paragraph of Array.isArray(paragraphs) ? paragraphs : []) {
    const entry = createParagraphEntry(paragraph)
    if (!entry) {
      continue
    }

    entries.push(entry)
    map.set(entry.id, entry)
  }

  return {
    entries,
    map
  }
}

const createAttachedResolution = ({ paragraphId, startOffset, endOffset, strategy, score = 1 }) => ({
  status: ANCHOR_ATTACHED,
  paragraphId,
  startOffset,
  endOffset,
  strategy,
  score
})

const createRangeAwareResolution = ({
  paragraphId = '',
  startParagraphId = '',
  endParagraphId = '',
  startOffset = 0,
  endOffset = 0,
  ranges = null,
  strategy,
  score = 1
}) => {
  const normalizedRanges = Array.isArray(ranges)
    ? ranges.map(createResolutionRange).filter(Boolean)
    : []
  const firstRange = normalizedRanges[0]
  const lastRange = normalizedRanges[normalizedRanges.length - 1]
  const normalizedParagraphId = paragraphId || startParagraphId || (firstRange ? firstRange.paragraphId : '')
  const normalizedStartParagraphId = startParagraphId || normalizedParagraphId
  const normalizedEndParagraphId = endParagraphId || (lastRange ? lastRange.paragraphId : normalizedParagraphId)

  const resolution = {
    status: ANCHOR_ATTACHED,
    paragraphId: normalizedParagraphId,
    startParagraphId: normalizedStartParagraphId,
    endParagraphId: normalizedEndParagraphId,
    startOffset: Number.isFinite(startOffset) ? startOffset : (firstRange ? firstRange.startOffset : 0),
    endOffset: Number.isFinite(endOffset) ? endOffset : (lastRange ? lastRange.endOffset : 0),
    strategy,
    score
  }

  if (normalizedRanges.length) {
    resolution.ranges = normalizedRanges
  }

  return resolution
}

const isMultiParagraphResolution = resolution => {
  if (!isPlainObject(resolution) || !Array.isArray(resolution.ranges) || resolution.ranges.length < 2) {
    return false
  }

  const firstRange = resolution.ranges[0]
  const lastRange = resolution.ranges[resolution.ranges.length - 1]
  return Boolean(firstRange && lastRange && firstRange.paragraphId !== lastRange.paragraphId)
}

const createDetachedResolution = (anchor, reason = ANCHOR_DETACHED) => ({
  status: ANCHOR_DETACHED,
  paragraphId: anchor && anchor.start ? anchor.start.key : '',
  startOffset: anchor && anchor.start ? anchor.start.offset : 0,
  endOffset: anchor && anchor.end ? anchor.end.offset : 0,
  strategy: reason,
  score: 0
})

const resolvePrimaryAnchor = (anchor, snapshot) => {
  const startIndex = snapshot.entries.findIndex(entry => entry.id === anchor.start.key)
  const endIndex = snapshot.entries.findIndex(entry => entry.id === anchor.end.key)
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    return null
  }

  const selectedParagraphs = snapshot.entries.slice(startIndex, endIndex + 1)
  const ranges = selectedParagraphs.map((paragraph, index) => {
    const isFirstRange = index === 0
    const isLastRange = index === selectedParagraphs.length - 1

    return {
      paragraphId: paragraph.id,
      startOffset: isFirstRange ? clamp(anchor.start.offset, 0, paragraph.text.length) : 0,
      endOffset: isLastRange
        ? clamp(anchor.end.offset, isFirstRange ? clamp(anchor.start.offset, 0, paragraph.text.length) : 0, paragraph.text.length)
        : paragraph.text.length
    }
  })

  const selectedText = ranges.map(range => {
    const paragraph = snapshot.map.get(range.paragraphId)
    return paragraph ? paragraph.text.slice(range.startOffset, range.endOffset) : ''
  }).join('\n\n')

  if (!normalizeString(selectedText) || normalizeString(selectedText) !== anchor.quote) {
    return null
  }

  const firstRange = ranges[0]
  const lastRange = ranges[ranges.length - 1]

  return createRangeAwareResolution({
    paragraphId: firstRange.paragraphId,
    startParagraphId: firstRange.paragraphId,
    endParagraphId: lastRange.paragraphId,
    startOffset: firstRange.startOffset,
    endOffset: lastRange.endOffset,
    ranges: firstRange.paragraphId === lastRange.paragraphId ? null : ranges,
    strategy: 'primary'
  })
}

const findExactQuoteInParagraph = (quote, paragraph) => {
  if (!quote || !paragraph || !paragraph.text) {
    return null
  }

  const startOffset = paragraph.text.indexOf(quote)
  if (startOffset < 0) {
    return null
  }

  return createAttachedResolution({
    paragraphId: paragraph.id,
    startOffset,
    endOffset: startOffset + quote.length,
    strategy: 'exact_quote'
  })
}

const createContextScore = (anchor, paragraph, startOffset, endOffset) => {
  const beforeContext = normalizeString(anchor.contextBefore)
  const afterContext = normalizeString(anchor.contextAfter)
  const scores = []

  if (beforeContext) {
    const actualBefore = normalizeString(
      paragraph.text.slice(Math.max(0, startOffset - beforeContext.length), startOffset)
    )
    scores.push(similarityScore(beforeContext, actualBefore))
  }

  if (afterContext) {
    const actualAfter = normalizeString(
      paragraph.text.slice(endOffset, endOffset + afterContext.length)
    )
    scores.push(similarityScore(afterContext, actualAfter))
  }

  if (!scores.length) {
    return 0
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length
}

const createCandidate = ({ anchor, paragraph, startOffset, endOffset, strategy }) => {
  const selectedText = paragraph.text.slice(startOffset, endOffset)
  const normalizedSelectedText = normalizeString(selectedText)
  if (!normalizedSelectedText) {
    return null
  }

  const quoteScore = similarityScore(anchor.quote, normalizedSelectedText)
  const contextScore = createContextScore(anchor, paragraph, startOffset, endOffset)

  return {
    paragraphId: paragraph.id,
    startOffset,
    endOffset,
    strategy,
    quoteScore,
    contextScore,
    score: (quoteScore * 0.7) + (contextScore * 0.3)
  }
}

const buildParagraphWindow = paragraphs => {
  const entries = []
  const segments = []
  let text = ''

  for (const paragraph of Array.isArray(paragraphs) ? paragraphs : []) {
    const entry = createParagraphEntry(paragraph)
    if (!entry) {
      continue
    }

    if (text) {
      text += '\n\n'
    }

    const startOffset = text.length
    text += entry.text
    const endOffset = text.length

    entries.push(entry)
    segments.push({
      paragraphId: entry.id,
      startOffset,
      endOffset
    })
  }

  return {
    entries,
    segments,
    text
  }
}

const projectWindowSelectionToRanges = (segments, startOffset, endOffset) => {
  const ranges = []

  for (const segment of Array.isArray(segments) ? segments : []) {
    const rangeStart = Math.max(startOffset, segment.startOffset)
    const rangeEnd = Math.min(endOffset, segment.endOffset)

    if (rangeEnd <= rangeStart) {
      continue
    }

    ranges.push({
      paragraphId: segment.paragraphId,
      startOffset: rangeStart - segment.startOffset,
      endOffset: rangeEnd - segment.startOffset
    })
  }

  return ranges
}

const findBestFuzzySpanCandidate = ({
  anchor,
  text,
  preferredStartOffset = 0,
  strategy = 'fuzzy',
  createCandidateFn
}) => {
  if (!text || !anchor.quote || typeof createCandidateFn !== 'function') {
    return null
  }

  const baseLength = anchor.quote.length
  const lengthDelta = Math.max(10, Math.ceil(baseLength * 0.75))
  const minLength = Math.max(4, baseLength - lengthDelta)
  const maxLength = Math.min(text.length, baseLength + lengthDelta)
  const radius = Math.max(24, Math.floor(baseLength * 1.5))
  const minStart = clamp(preferredStartOffset - radius, 0, text.length)
  const maxStart = clamp(preferredStartOffset + radius, 0, text.length)
  const seen = new Set()
  const candidates = []

  for (let currentLength = minLength; currentLength <= maxLength; currentLength += 1) {
    const windowStartMin = clamp(minStart - currentLength, 0, text.length)
    const windowStartMax = clamp(maxStart, 0, text.length - currentLength)
    for (let startOffset = windowStartMin; startOffset <= windowStartMax; startOffset += 1) {
      const endOffset = startOffset + currentLength
      const key = `${startOffset}:${endOffset}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)

      const candidate = createCandidateFn({
        startOffset,
        endOffset,
        strategy
      })
      if (candidate) {
        candidates.push(candidate)
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score)
  const [best, second] = candidates
  if (!best) {
    return null
  }

  const margin = second ? (best.score - second.score) : 1
  const safeByContext = best.contextScore >= 0.95 && best.quoteScore >= 0.55
  const safe = safeByContext || best.score >= STRONG_FUZZY_SCORE || (best.score >= MIN_FUZZY_SCORE && margin >= MIN_FUZZY_MARGIN)
  if (!safe) {
    return null
  }

  return best
}

const levenshteinDistance = (left, right) => {
  if (!left.length) {
    return right.length
  }

  if (!right.length) {
    return left.length
  }

  const previous = new Array(right.length + 1).fill(0)
  const current = new Array(right.length + 1).fill(0)

  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost
      )
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column]
    }
  }

  return previous[right.length]
}

const similarityScore = (left, right) => {
  if (!left || !right) {
    return 0
  }

  if (left === right) {
    return 1
  }

  const maxLength = Math.max(left.length, right.length)
  if (!maxLength) {
    return 0
  }

  return 1 - (levenshteinDistance(left, right) / maxLength)
}

const findFuzzyMatchInParagraph = (anchor, paragraph, preferredStartOffset = 0, strategy = 'fuzzy') => {
  const best = findBestFuzzySpanCandidate({
    anchor,
    text: paragraph && paragraph.text ? paragraph.text : '',
    preferredStartOffset,
    strategy,
    createCandidateFn: ({ startOffset, endOffset, strategy: candidateStrategy }) => {
      return createCandidate({
        anchor,
        paragraph,
        startOffset,
        endOffset,
        strategy: candidateStrategy
      })
    }
  })
  if (!best) {
    return null
  }

  return createAttachedResolution({
    paragraphId: best.paragraphId,
    startOffset: best.startOffset,
    endOffset: best.endOffset,
    strategy: best.strategy,
    score: best.score
  })
}

const findFuzzyMatchInParagraphWindow = (anchor, window, preferredStartOffset = 0, strategy = 'fuzzy_cross_paragraph') => {
  const best = findBestFuzzySpanCandidate({
    anchor,
    text: window && window.text ? window.text : '',
    preferredStartOffset,
    strategy,
    createCandidateFn: ({ startOffset, endOffset, strategy: candidateStrategy }) => {
      const paragraph = {
        id: window && Array.isArray(window.entries) && window.entries.length ? window.entries[0].id : '',
        text: window && window.text ? window.text : ''
      }
      const candidate = createCandidate({
        anchor,
        paragraph,
        startOffset,
        endOffset,
        strategy: candidateStrategy
      })
      if (!candidate) {
        return null
      }

      const ranges = projectWindowSelectionToRanges(window && window.segments ? window.segments : [], startOffset, endOffset)
      if (ranges.length < 2) {
        return null
      }

      const firstRange = ranges[0]
      const lastRange = ranges[ranges.length - 1]

      return {
        ...candidate,
        paragraphId: firstRange.paragraphId,
        startParagraphId: firstRange.paragraphId,
        endParagraphId: lastRange.paragraphId,
        ranges
      }
    }
  })

  if (!best) {
    return null
  }

  if (!isMultiParagraphResolution(best)) {
    return null
  }

  const firstRange = best.ranges[0]
  const lastRange = best.ranges[best.ranges.length - 1]

  return createRangeAwareResolution({
    paragraphId: firstRange.paragraphId,
    startParagraphId: firstRange.paragraphId,
    endParagraphId: lastRange.paragraphId,
    startOffset: firstRange.startOffset,
    endOffset: lastRange.endOffset,
    ranges: best.ranges,
    strategy: best.strategy,
    score: best.score
  })
}

const findNearbyCrossParagraphResolution = (anchor, entries, startIndex, endIndex) => {
  if (!Array.isArray(entries) || entries.length < 2) {
    return null
  }

  const candidates = []
  const hasStart = startIndex >= 0
  const hasEnd = endIndex >= 0
  if (!hasStart && !hasEnd) {
    return null
  }

  const preferredIndex = hasStart
    ? startIndex
    : endIndex
  const preferredOffsetHint = hasStart
    ? anchor.start.offset
    : anchor.end.offset
  const oneEndpointOffset = hasStart && hasEnd
    ? preferredOffsetHint
    : (hasStart
      ? preferredOffsetHint + Math.floor(anchor.quote.length / 2)
      : Math.max(0, preferredOffsetHint - Math.floor(anchor.quote.length / 2)))
  const minWindowSize = 2
  const maxWindowSize = Math.min(entries.length, hasStart && hasEnd ? Math.abs(endIndex - startIndex) + 2 : 4)

  for (let windowSize = minWindowSize; windowSize <= maxWindowSize; windowSize += 1) {
    const windowStartCandidates = []
    const addWindowStart = windowStart => {
      if (windowStart < 0 || windowStart > entries.length - windowSize || windowStartCandidates.includes(windowStart)) {
        return
      }
      windowStartCandidates.push(windowStart)
    }

    if (hasStart && hasEnd) {
      const searchStartMin = Math.max(0, preferredIndex - 1)
      const searchStartMax = Math.min(entries.length - windowSize, preferredIndex)

      for (let windowStart = searchStartMin; windowStart <= searchStartMax; windowStart += 1) {
        addWindowStart(windowStart)
      }
    } else {
      const searchStartMin = Math.max(0, preferredIndex - windowSize + 1)
      const searchStartMax = Math.min(entries.length - windowSize, preferredIndex)

      for (let windowStart = searchStartMin; windowStart <= searchStartMax; windowStart += 1) {
        addWindowStart(windowStart)
      }
    }

    for (const windowStart of windowStartCandidates) {
      const window = buildParagraphWindow(entries.slice(windowStart, windowStart + windowSize))
      if (window.entries.length < 2) {
        continue
      }

      const preferredStartSegment = window.segments.find(segment => segment.paragraphId === anchor.start.key) ||
        window.segments.find(segment => segment.paragraphId === anchor.end.key)
      const preferredStartOffset = preferredStartSegment
        ? clamp(preferredStartSegment.startOffset + oneEndpointOffset, 0, window.text.length)
        : oneEndpointOffset
      const resolution = findFuzzyMatchInParagraphWindow(
        anchor,
        window,
        preferredStartOffset,
        'fuzzy_cross_paragraph_window'
      )
      if (resolution) {
        candidates.push(resolution)
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score)
  return candidates[0] || null
}

const findLocalSingleParagraphRecovery = (anchor, entries, startIndex, endIndex) => {
  if (!Array.isArray(entries) || !entries.length) {
    return null
  }

  const hasStart = startIndex >= 0
  const hasEnd = endIndex >= 0
  if (!hasStart && !hasEnd) {
    return null
  }

  const minIndex = hasStart && hasEnd
    ? Math.min(startIndex, endIndex)
    : (hasStart ? startIndex : endIndex)
  const maxIndex = hasStart && hasEnd
    ? Math.max(startIndex, endIndex)
    : (hasStart ? startIndex : endIndex)
  const windowStart = Math.max(0, minIndex - 1)
  const windowEnd = Math.min(entries.length - 1, maxIndex + 1)
  const localParagraphs = entries
    .slice(windowStart, windowEnd + 1)
    .map((paragraph, offset) => ({
      paragraph,
      index: windowStart + offset
    }))
    .sort((left, right) => {
      const leftIsEndpoint = left.index === startIndex || left.index === endIndex
      const rightIsEndpoint = right.index === startIndex || right.index === endIndex

      if (leftIsEndpoint !== rightIsEndpoint) {
        return leftIsEndpoint ? -1 : 1
      }

      const leftDistance = Math.min(
        hasStart ? Math.abs(left.index - startIndex) : Number.POSITIVE_INFINITY,
        hasEnd ? Math.abs(left.index - endIndex) : Number.POSITIVE_INFINITY
      )
      const rightDistance = Math.min(
        hasStart ? Math.abs(right.index - startIndex) : Number.POSITIVE_INFINITY,
        hasEnd ? Math.abs(right.index - endIndex) : Number.POSITIVE_INFINITY
      )

      return leftDistance - rightDistance
    })

  for (const { paragraph } of localParagraphs) {
    const exactResolution = findExactQuoteInParagraph(anchor.quote, paragraph)
    if (exactResolution) {
      return {
        ...exactResolution,
        strategy: 'exact_quote_local_cross_paragraph'
      }
    }
  }

  for (const { paragraph } of localParagraphs) {
    const preferredStartOffset = paragraph.id === anchor.start.key
      ? anchor.start.offset
      : (paragraph.id === anchor.end.key
        ? anchor.end.offset
        : Math.max(0, paragraph.text.indexOf(anchor.contextBefore || '')))

    const fuzzyResolution = findFuzzyMatchInParagraph(
      anchor,
      paragraph,
      preferredStartOffset,
      'fuzzy_local_cross_paragraph'
    )
    if (fuzzyResolution) {
      return fuzzyResolution
    }
  }

  return null
}

export const resolveMarginAnchor = (anchor, paragraphs = []) => {
  const normalizedAnchor = cloneMarginAnchor(anchor)
  if (!normalizedAnchor || !normalizedAnchor.start || !normalizedAnchor.end || !normalizedAnchor.quote) {
    return createDetachedResolution(normalizedAnchor, 'invalid_anchor')
  }

  const { entries, map } = buildDocumentSnapshot(paragraphs)
  if (!entries.length) {
    return createDetachedResolution(normalizedAnchor, 'missing_document')
  }

  const primaryResolution = resolvePrimaryAnchor(normalizedAnchor, { entries, map })
  if (primaryResolution) {
    return primaryResolution
  }

  const startIndex = entries.findIndex(entry => entry.id === normalizedAnchor.start.key)
  const endIndex = entries.findIndex(entry => entry.id === normalizedAnchor.end.key)
  if (normalizedAnchor.start.key !== normalizedAnchor.end.key) {
    const nearbyCrossParagraphResolution = findNearbyCrossParagraphResolution(
      normalizedAnchor,
      entries,
      startIndex,
      endIndex
    )
    if (nearbyCrossParagraphResolution) {
      return nearbyCrossParagraphResolution
    }

    const localSingleParagraphResolution = findLocalSingleParagraphRecovery(
      normalizedAnchor,
      entries,
      startIndex,
      endIndex
    )
    if (localSingleParagraphResolution) {
      return localSingleParagraphResolution
    }

    return createDetachedResolution(normalizedAnchor)
  }

  const preferredParagraph = map.get(normalizedAnchor.start.key)
  if (preferredParagraph) {
    const exactInPrimary = findExactQuoteInParagraph(normalizedAnchor.quote, preferredParagraph)
    if (exactInPrimary) {
      return {
        ...exactInPrimary,
        strategy: 'exact_quote_same_paragraph'
      }
    }

    const fuzzyInPrimary = findFuzzyMatchInParagraph(
      normalizedAnchor,
      preferredParagraph,
      normalizedAnchor.start.offset,
      'fuzzy_same_paragraph'
    )
    if (fuzzyInPrimary) {
      return fuzzyInPrimary
    }
  }

  for (const paragraph of entries) {
    if (preferredParagraph && paragraph.id === preferredParagraph.id) {
      continue
    }

    const exactResolution = findExactQuoteInParagraph(normalizedAnchor.quote, paragraph)
    if (exactResolution) {
      return exactResolution
    }
  }

  for (const paragraph of entries) {
    if (preferredParagraph && paragraph.id === preferredParagraph.id) {
      continue
    }

    const fuzzyResolution = findFuzzyMatchInParagraph(
      normalizedAnchor,
      paragraph,
      Math.max(0, paragraph.text.indexOf(normalizedAnchor.contextBefore || '')),
      'fuzzy_document'
    )
    if (fuzzyResolution) {
      return fuzzyResolution
    }
  }

  return createDetachedResolution(normalizedAnchor)
}

export const resolveMarginThread = (thread, paragraphs = []) => {
  const anchor = cloneMarginAnchor(thread && thread.anchor)
  return {
    ...thread,
    anchor,
    resolvedAnchor: resolveMarginAnchor(anchor, paragraphs)
  }
}

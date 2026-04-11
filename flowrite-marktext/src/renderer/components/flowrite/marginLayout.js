const isFiniteNumber = value => Number.isFinite(value)

const DEFAULT_GAP = 14
const DEFAULT_COMPRESSION_DRIFT_THRESHOLD = 80
const DEFAULT_COMPRESSION_MESSAGE_COUNT_THRESHOLD = 4

const toSafeCount = thread => {
  if (!thread) {
    return 0
  }

  if (isFiniteNumber(thread.messageCount)) {
    return Math.max(0, thread.messageCount)
  }

  if (Array.isArray(thread.comments)) {
    return thread.comments.length
  }

  return 0
}

export const buildMarginLayout = (threads, options = {}) => {
  const gap = isFiniteNumber(options.gap) ? options.gap : DEFAULT_GAP
  const compressionDriftThreshold = isFiniteNumber(options.compressionDriftThreshold)
    ? options.compressionDriftThreshold
    : DEFAULT_COMPRESSION_DRIFT_THRESHOLD
  const compressionMessageCountThreshold = isFiniteNumber(options.compressionMessageCountThreshold)
    ? options.compressionMessageCountThreshold
    : DEFAULT_COMPRESSION_MESSAGE_COUNT_THRESHOLD

  return (Array.isArray(threads) ? threads.slice() : [])
    .filter(Boolean)
    .sort((left, right) => {
      const leftTop = isFiniteNumber(left.naturalTop) ? left.naturalTop : 0
      const rightTop = isFiniteNumber(right.naturalTop) ? right.naturalTop : 0

      if (leftTop !== rightTop) {
        return leftTop - rightTop
      }

      const leftOrder = isFiniteNumber(left.order) ? left.order : 0
      const rightOrder = isFiniteNumber(right.order) ? right.order : 0

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }

      const leftId = typeof left.id === 'string' ? left.id : ''
      const rightId = typeof right.id === 'string' ? right.id : ''
      return leftId.localeCompare(rightId)
    })
    .reduce((laidOut, thread) => {
      const naturalTop = isFiniteNumber(thread.naturalTop) ? thread.naturalTop : 0
      const height = Math.max(0, isFiniteNumber(thread.height) ? thread.height : 0)
      const previous = laidOut[laidOut.length - 1]
      const top = previous
        ? Math.max(naturalTop, previous.top + previous.height + gap)
        : naturalTop
      const drift = top - naturalTop
      const messageCount = toSafeCount(thread)
      const collapsed = Boolean(thread.collapsed) || drift >= compressionDriftThreshold || messageCount >= compressionMessageCountThreshold

      laidOut.push({
        ...thread,
        naturalTop,
        height,
        top,
        bottom: top + height,
        drift,
        messageCount,
        collapsed
      })

      return laidOut
    }, [])
}

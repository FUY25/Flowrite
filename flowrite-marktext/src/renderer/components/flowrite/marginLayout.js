const isFiniteNumber = value => Number.isFinite(value)

const DEFAULT_GAP = 14
const DEFAULT_COMPRESSION_DRIFT_THRESHOLD = 80
const ACTIVE_THREAD_WEIGHT = 3

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
  const sortedThreads = (Array.isArray(threads) ? threads.slice() : [])
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
    .map(thread => ({
      ...thread,
      naturalTop: isFiniteNumber(thread.naturalTop) ? thread.naturalTop : 0,
      height: Math.max(0, isFiniteNumber(thread.height) ? thread.height : 0)
    }))

  const offsets = []
  let offset = 0
  sortedThreads.forEach((thread, index) => {
    offsets[index] = offset
    offset += thread.height + gap
  })

  const fittedTops = fitStableSlots(sortedThreads, offsets)

  const lowestTop = fittedTops.reduce((minimum, top) => Math.min(minimum, top), 0)
  const topOffset = lowestTop < 0 ? -lowestTop : 0

  return sortedThreads.map((thread, index) => {
    const top = fittedTops[index] + topOffset
    const drift = top - thread.naturalTop
    const messageCount = toSafeCount(thread)
    const collapsed = Boolean(thread.collapsed) ||
      Math.abs(drift) >= compressionDriftThreshold

    return {
      ...thread,
      top,
      bottom: top + thread.height,
      drift,
      messageCount,
      collapsed
    }
  })
}

const fitStableSlots = (threads, offsets) => {
  const blocks = []

  threads.forEach((thread, index) => {
    const weight = thread.active ? ACTIVE_THREAD_WEIGHT : 1
    const target = thread.naturalTop - offsets[index]
    blocks.push({
      start: index,
      end: index,
      totalWeight: weight,
      totalTarget: target * weight,
      mean: target
    })

    while (blocks.length > 1) {
      const current = blocks[blocks.length - 1]
      const previous = blocks[blocks.length - 2]
      if (previous.mean <= current.mean) {
        break
      }

      const mergedWeight = previous.totalWeight + current.totalWeight
      const mergedTarget = previous.totalTarget + current.totalTarget
      blocks.splice(blocks.length - 2, 2, {
        start: previous.start,
        end: current.end,
        totalWeight: mergedWeight,
        totalTarget: mergedTarget,
        mean: mergedTarget / mergedWeight
      })
    }
  })

  const fittedTops = new Array(threads.length)
  blocks.forEach(block => {
    for (let index = block.start; index <= block.end; index += 1) {
      fittedTops[index] = block.mean + offsets[index]
    }
  })

  return fittedTops
}

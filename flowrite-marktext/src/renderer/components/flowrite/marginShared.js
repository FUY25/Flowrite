import { ANCHOR_DETACHED } from '../../../flowrite/constants'
import { FLOWRITE_MARGIN_THREAD_COMPOSER_ID } from '../../../flowrite/commentUi'

export const createEmptyParagraphIndex = () => ({
  list: [],
  byId: new Map()
})

export const getMarginEditorShell = vm => {
  if (vm.editorRoot) {
    return vm.editorRoot
  }

  if (vm.$el && typeof vm.$el.closest === 'function') {
    return vm.$el.closest('.editor-main') || vm.$el.parentElement || null
  }

  if (typeof document !== 'undefined') {
    const shell = document.querySelector('.editor-main')
    if (shell) {
      return shell
    }
  }

  return vm.$el ? vm.$el.parentElement : null
}

export const getMarginEditorContainer = vm => {
  const root = getMarginEditorShell(vm)
  return root ? root.querySelector('.editor-component') : null
}

export const getMarginEditorContainerRect = vm => {
  const container = getMarginEditorContainer(vm)
  return container ? container.getBoundingClientRect() : null
}

export const buildMarginFallbackParagraphIndex = vm => {
  const root = getMarginEditorShell(vm)
  if (!root) {
    return createEmptyParagraphIndex()
  }

  const list = Array.from(root.querySelectorAll('#ag-editor-id .ag-paragraph[id]')).map(element => ({
    id: element.id,
    text: element.textContent || '',
    element
  }))

  return {
    list,
    byId: new Map(list.map(paragraph => [paragraph.id, paragraph]))
  }
}

export const resolveMarginParagraphIndex = (vm, paragraphIndex) => {
  return paragraphIndex && Array.isArray(paragraphIndex.list) && paragraphIndex.list.length
    ? paragraphIndex
    : buildMarginFallbackParagraphIndex(vm)
}

export const getResolvedMarginRanges = thread => {
  const resolution = thread && thread.resolvedAnchor ? thread.resolvedAnchor : {}
  return Array.isArray(resolution.ranges) && resolution.ranges.length
    ? resolution.ranges
    : [{
      paragraphId: resolution.paragraphId || resolution.startParagraphId || (thread.anchor && thread.anchor.start ? thread.anchor.start.key : ''),
      startOffset: Number.isFinite(resolution.startOffset)
        ? resolution.startOffset
        : (thread.anchor && thread.anchor.start ? thread.anchor.start.offset : 0),
      endOffset: Number.isFinite(resolution.endOffset)
        ? resolution.endOffset
        : (thread.anchor && thread.anchor.end ? thread.anchor.end.offset : 0)
    }]
}

export const resolveMarginThreadVerticalPosition = ({
  thread,
  paragraphIndex,
  editorRect,
  editorContainer,
  positionCache = {},
  verticalOffset = 0
} = {}) => {
  const resolution = thread && thread.resolvedAnchor ? thread.resolvedAnchor : {}
  const [firstRange] = getResolvedMarginRanges(thread)

  if (!firstRange || !editorRect || !editorContainer) {
    return null
  }

  const paragraph = paragraphIndex.byId.get(firstRange.paragraphId)
  const rect = paragraph && paragraph.element
    ? paragraph.element.getBoundingClientRect()
    : null

  if (!rect) {
    if (resolution.status !== ANCHOR_DETACHED) {
      return null
    }

    const cachedTop = positionCache[thread.id]
    if (Number.isFinite(cachedTop)) {
      return {
        top: cachedTop,
        status: resolution.status || '',
        detached: true
      }
    }

    const fallbackParagraph = Array.isArray(paragraphIndex && paragraphIndex.list) && paragraphIndex.list.length
      ? paragraphIndex.list[0]
      : null
    const fallbackRect = fallbackParagraph && fallbackParagraph.element
      ? fallbackParagraph.element.getBoundingClientRect()
      : null

    return {
      top: fallbackRect
        ? Math.max(0, fallbackRect.top - editorRect.top + editorContainer.scrollTop + verticalOffset)
        : 0,
      status: resolution.status || '',
      detached: true
    }
  }

  return {
    top: Math.max(0, rect.top - editorRect.top + editorContainer.scrollTop + verticalOffset),
    status: resolution.status || '',
    detached: resolution.status === ANCHOR_DETACHED
  }
}

const serializeRange = range => {
  if (!range) {
    return ''
  }

  return [
    range.paragraphId || '',
    Number.isFinite(range.startOffset) ? range.startOffset : '',
    Number.isFinite(range.endOffset) ? range.endOffset : ''
  ].join(':')
}

const serializeResolution = resolution => {
  if (!resolution) {
    return ''
  }

  const ranges = Array.isArray(resolution.ranges)
    ? resolution.ranges.map(serializeRange).join(',')
    : ''

  return [
    resolution.status || '',
    resolution.paragraphId || '',
    resolution.startParagraphId || '',
    resolution.endParagraphId || '',
    Number.isFinite(resolution.startOffset) ? resolution.startOffset : '',
    Number.isFinite(resolution.endOffset) ? resolution.endOffset : '',
    ranges
  ].join('|')
}

const serializeAnchorPoint = point => {
  if (!point) {
    return ''
  }

  return `${point.key || ''}:${Number.isFinite(point.offset) ? point.offset : ''}`
}

const serializeThreadAnchor = anchor => {
  if (!anchor) {
    return ''
  }

  return [
    serializeAnchorPoint(anchor.start),
    serializeAnchorPoint(anchor.end),
    anchor.quote || '',
    serializeResolution(anchor.resolution)
  ].join('|')
}

const serializeThreadComments = comments => {
  return (Array.isArray(comments) ? comments : [])
    .map(comment => [
      comment.id || '',
      comment.author || '',
      comment.createdAt || '',
      comment.body || ''
    ].join(':'))
    .join('|')
}

export const getMarginThreadRefreshKey = threads => {
  return (Array.isArray(threads) ? threads : [])
    .map(thread => [
      thread.id || '',
      thread.updatedAt || '',
      thread.status || '',
      thread.scope || '',
      thread.collapsed ? '1' : '0',
      serializeThreadAnchor(thread.anchor),
      serializeResolution(thread.resolvedAnchor),
      serializeThreadComments(thread.comments)
    ].join('~'))
    .join('||')
}

export const getIdListRefreshKey = values => {
  return (Array.isArray(values) ? values : []).filter(Boolean).join('|')
}

export const bindMarginViewportListeners = (vm, {
  onRefresh,
  onClickCapture = null
} = {}) => {
  const cleanup = []
  const scheduleRefresh = typeof onRefresh === 'function' ? onRefresh : () => {}
  const resizeListener = () => {
    scheduleRefresh()
  }

  window.addEventListener('resize', resizeListener)
  cleanup.push(() => {
    window.removeEventListener('resize', resizeListener)
  })

  const container = getMarginEditorContainer(vm)
  if (!container) {
    return {
      container: null,
      teardown: () => {
        cleanup.forEach(fn => fn())
      }
    }
  }

  const scrollListener = () => {
    scheduleRefresh()
  }
  container.addEventListener('scroll', scrollListener, { passive: true })
  cleanup.push(() => {
    container.removeEventListener('scroll', scrollListener)
  })

  if (typeof onClickCapture === 'function') {
    container.addEventListener('click', onClickCapture, true)
    cleanup.push(() => {
      container.removeEventListener('click', onClickCapture, true)
    })
  }

  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      scheduleRefresh()
    })
    resizeObserver.observe(container)
    cleanup.push(() => {
      resizeObserver.disconnect()
    })
  }

  return {
    container,
    teardown: () => {
      cleanup.forEach(fn => fn())
    }
  }
}

export const resolveComposerThreadId = threadId => threadId || FLOWRITE_MARGIN_THREAD_COMPOSER_ID

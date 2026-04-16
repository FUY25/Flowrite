<template>
  <span v-if="false"></span>
</template>

<script>
import { mapState } from 'vuex'
import { resolveMarginThread } from '../../../flowrite/anchors'
import { SCOPE_MARGIN, ANCHOR_DETACHED } from '../../../flowrite/constants'
import {
  bindMarginViewportListeners,
  createEmptyParagraphIndex,
  getIdListRefreshKey,
  getMarginThreadRefreshKey,
  getResolvedMarginRanges,
  resolveMarginParagraphIndex
} from './marginShared'
const ACTIVE_HIGHLIGHT_NAME = 'flowrite-margin-anchor-active'
const UNDERLINE_HIGHLIGHT_NAME = 'flowrite-margin-anchor-underline'

const supportsCssHighlights = (() => {
  let cached = null

  return () => {
    if (typeof cached === 'boolean') {
      return cached
    }

    cached = typeof window !== 'undefined' &&
      typeof window.Highlight === 'function' &&
      typeof CSS !== 'undefined' &&
      CSS.highlights &&
      typeof CSS.highlights.set === 'function'

    return cached
  }
})()

const createRangeFromParagraph = (paragraph, startOffset, endOffset) => {
  if (!paragraph || typeof document === 'undefined') {
    return null
  }

  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let consumed = 0
  let startNode = null
  let endNode = null
  let startNodeOffset = 0
  let endNodeOffset = 0
  let node = null

  const safeStartOffset = Number.isFinite(startOffset) ? startOffset : 0
  const safeEndOffset = Number.isFinite(endOffset) ? endOffset : 0

  while ((node = walker.nextNode())) {
    const nextConsumed = consumed + node.textContent.length
    if (!startNode && safeStartOffset >= consumed && safeStartOffset <= nextConsumed) {
      startNode = node
      startNodeOffset = safeStartOffset - consumed
    }
    if (!endNode && safeEndOffset >= consumed && safeEndOffset <= nextConsumed) {
      endNode = node
      endNodeOffset = safeEndOffset - consumed
    }
    consumed = nextConsumed
  }

  if (!startNode || !endNode) {
    return null
  }

  range.setStart(startNode, startNodeOffset)
  range.setEnd(endNode, endNodeOffset)
  return range
}

export default {
  props: {
    editorRoot: {
      type: Object,
      default: null
    },
    paragraphIndex: {
      type: Object,
      default: createEmptyParagraphIndex
    }
  },
  data () {
    return {
      interactiveRanges: [],
      rafId: null,
      viewportBinding: null
    }
  },
  computed: {
    ...mapState({
      comments: state => state.flowrite.comments,
      composerMarginThread: state => state.flowrite.composerMarginThread,
      markdown: state => (state.editor.currentFile ? state.editor.currentFile.markdown || '' : ''),
      showAnnotationsPane: state => state.flowrite.showAnnotationsPane,
      activeMarginThreadId: state => state.flowrite.activeMarginThreadId,
      highlightedMarginThreadIds: state => state.flowrite.highlightedMarginThreadIds
    }),

    marginThreads () {
      return Array.isArray(this.comments)
        ? this.comments.filter(thread => thread && thread.scope === SCOPE_MARGIN)
        : []
    },

    renderedThreads () {
      const threads = this.marginThreads.slice()
      if (this.composerMarginThread && this.composerMarginThread.scope === SCOPE_MARGIN) {
        threads.push(this.composerMarginThread)
      }
      return threads
    },

    highlightedThreadIds () {
      return new Set([
        ...(this.highlightedMarginThreadIds || []),
        this.activeMarginThreadId
      ].filter(Boolean))
    },

    renderedThreadsRefreshKey () {
      return getMarginThreadRefreshKey(this.renderedThreads)
    },

    highlightedThreadIdsKey () {
      return getIdListRefreshKey([
        ...(this.highlightedMarginThreadIds || []),
        this.activeMarginThreadId
      ])
    }
  },
  watch: {
    renderedThreadsRefreshKey () {
      this.scheduleRefresh()
    },
    markdown () {
      this.scheduleRefresh()
    },
    editorRoot () {
      this.attachListeners()
      this.scheduleRefresh()
    },
    paragraphIndex () {
      this.scheduleRefresh()
    },
    showAnnotationsPane () {
      this.scheduleRefresh()
    },
    activeMarginThreadId () {
      this.scheduleRefresh()
    },
    highlightedThreadIdsKey () {
      this.scheduleRefresh()
    }
  },
  mounted () {
    this.attachListeners()
    this.scheduleRefresh()
  },
  beforeDestroy () {
    this.detachListeners()
    this.clearNativeHighlights()
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  },
  methods: {
    createThreadRange (paragraphIndex, paragraphId, startOffset, endOffset) {
      const paragraph = paragraphIndex.byId.get(paragraphId)
      if (!paragraph) {
        return null
      }

      return createRangeFromParagraph(paragraph.element, startOffset, endOffset)
    },

    buildThreadRanges (thread, paragraphIndex) {
      const resolution = thread.resolvedAnchor || {}
      const ranges = getResolvedMarginRanges(thread)

      return ranges
        .map((rangeEntry, index) => {
          const range = this.createThreadRange(paragraphIndex, rangeEntry.paragraphId, rangeEntry.startOffset, rangeEntry.endOffset)
          return range
            ? {
              key: `${thread.id}:${rangeEntry.paragraphId}:${index}`,
              threadId: thread.id,
              detached: resolution.status === ANCHOR_DETACHED,
              clickable: this.marginThreads.some(candidate => candidate && candidate.id === thread.id),
              range
            }
            : null
        })
        .filter(Boolean)
    },

    clearNativeHighlights () {
      if (supportsCssHighlights()) {
        CSS.highlights.delete(ACTIVE_HIGHLIGHT_NAME)
        CSS.highlights.delete(UNDERLINE_HIGHLIGHT_NAME)
      }
    },

    setNativeHighlight (name, ranges) {
      if (!supportsCssHighlights()) {
        return false
      }

      if (!ranges.length) {
        CSS.highlights.delete(name)
        return true
      }

      CSS.highlights.set(name, new window.Highlight(...ranges))
      return true
    },

    refreshResolvedThreads () {
      const editorContainer = this.viewportBinding ? this.viewportBinding.container : null
      if (!editorContainer) {
        this.interactiveRanges = []
        this.clearNativeHighlights()
        return
      }

      const paragraphIndex = resolveMarginParagraphIndex(this, this.paragraphIndex)
      const resolvedThreads = this.renderedThreads
        .map(thread => resolveMarginThread(thread, paragraphIndex.list))

      const underlinedThreads = this.showAnnotationsPane
        ? resolvedThreads
        : resolvedThreads.filter(thread => this.highlightedThreadIds.has(thread.id))
      const activeThreads = resolvedThreads
        .filter(thread => this.highlightedThreadIds.has(thread.id))

      const underlineRanges = underlinedThreads.flatMap(thread => this.buildThreadRanges(thread, paragraphIndex))
      const activeRanges = activeThreads.flatMap(thread => this.buildThreadRanges(thread, paragraphIndex))

      this.interactiveRanges = underlineRanges.filter(entry => entry.clickable)
      this.setNativeHighlight(
        UNDERLINE_HIGHLIGHT_NAME,
        underlineRanges.filter(entry => !entry.detached).map(entry => entry.range)
      )
      this.setNativeHighlight(
        ACTIVE_HIGHLIGHT_NAME,
        activeRanges.filter(entry => !entry.detached).map(entry => entry.range)
      )
    },

    scheduleRefresh () {
      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId)
      }

      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null
        this.refreshResolvedThreads()
      })
    },

    attachListeners () {
      this.detachListeners()

      const clickListener = event => {
        const caretRange = typeof document.caretRangeFromPoint === 'function'
          ? document.caretRangeFromPoint(event.clientX, event.clientY)
          : null
        const caretPosition = !caretRange && typeof document.caretPositionFromPoint === 'function'
          ? document.caretPositionFromPoint(event.clientX, event.clientY)
          : null
        const node = caretRange
          ? caretRange.startContainer
          : (caretPosition ? caretPosition.offsetNode : null)
        const offset = caretRange
          ? caretRange.startOffset
          : (caretPosition ? caretPosition.offset : null)

        if (!node || !Number.isFinite(offset)) {
          return
        }

        const match = this.interactiveRanges.find(entry => {
          if (!entry || !entry.range || typeof entry.range.comparePoint !== 'function') {
            return false
          }

          try {
            return entry.range.comparePoint(node, offset) === 0
          } catch (error) {
            return false
          }
        })

        if (match) {
          event.preventDefault()
          this.activateThread(match.threadId)
        }
      }

      this.viewportBinding = bindMarginViewportListeners(this, {
        onRefresh: () => {
          this.scheduleRefresh()
        },
        onClickCapture: clickListener
      })
    },

    detachListeners () {
      if (this.viewportBinding) {
        this.viewportBinding.teardown()
        this.viewportBinding = null
      }
    },

    activateThread (threadId) {
      if (!threadId) {
        return
      }

      this.$store.dispatch('ACTIVATE_MARGIN_THREAD', threadId)
    }
  }
}
</script>

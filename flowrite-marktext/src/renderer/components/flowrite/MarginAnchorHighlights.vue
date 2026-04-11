<template>
  <span v-if="false"></span>
</template>

<script>
import { mapState } from 'vuex'
import { resolveMarginThread } from '../../../flowrite/anchors'
import { SCOPE_MARGIN, ANCHOR_DETACHED } from '../../../flowrite/constants'
const HIGHLIGHT_NAME = 'flowrite-margin-anchor-active'

const supportsCssHighlights = () => {
  return typeof window !== 'undefined' &&
    typeof window.Highlight === 'function' &&
    typeof CSS !== 'undefined' &&
    CSS.highlights &&
    typeof CSS.highlights.set === 'function'
}

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
      default: () => ({
        list: [],
        byId: new Map()
      })
    }
  },
  data () {
    return {
      interactiveRanges: [],
      rafId: null,
      scrollContainer: null,
      resizeObserver: null,
      resizeListener: null,
      clickListener: null
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
    }
  },
  watch: {
    comments: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
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
    composerMarginThread: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
    },
    activeMarginThreadId () {
      this.scheduleRefresh()
    },
    highlightedMarginThreadIds: {
      deep: true,
      handler () {
        this.scheduleRefresh()
      }
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
    getEditorContainer () {
      const root = this.getEditorShell()
      if (!root) {
        return null
      }

      return root.querySelector('.editor-component')
    },

    getEditorShell () {
      if (this.editorRoot) {
        return this.editorRoot
      }

      if (this.$el && typeof this.$el.closest === 'function') {
        return this.$el.closest('.editor-main') || this.$el.parentElement || null
      }

      if (typeof document !== 'undefined') {
        const shell = document.querySelector('.editor-main')
        if (shell) {
          return shell
        }
      }

      return this.$el ? this.$el.parentElement : null
    },

    buildFallbackParagraphIndex () {
      const root = this.getEditorShell()
      if (!root) {
        return {
          list: [],
          byId: new Map()
        }
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
    },

    getParagraphIndex () {
      return this.paragraphIndex && Array.isArray(this.paragraphIndex.list) && this.paragraphIndex.list.length
        ? this.paragraphIndex
        : this.buildFallbackParagraphIndex()
    },

    createThreadRange (paragraphIndex, paragraphId, startOffset, endOffset) {
      const paragraph = paragraphIndex.byId.get(paragraphId)
      if (!paragraph) {
        return null
      }

      return createRangeFromParagraph(paragraph.element, startOffset, endOffset)
    },

    buildThreadRanges (thread, paragraphIndex) {
      const resolution = thread.resolvedAnchor || {}
      const ranges = Array.isArray(resolution.ranges) && resolution.ranges.length
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
        CSS.highlights.delete(HIGHLIGHT_NAME)
      }
    },

    applyNativeHighlights (threadRanges) {
      if (!supportsCssHighlights()) {
        return false
      }

      const attachedRanges = threadRanges
        .filter(entry => !entry.detached)
        .map(entry => entry.range)

      if (!attachedRanges.length) {
        this.clearNativeHighlights()
        return true
      }

      CSS.highlights.set(HIGHLIGHT_NAME, new window.Highlight(...attachedRanges))
      return true
    },

    refreshResolvedThreads () {
      const editorContainer = this.getEditorContainer()
      if (!editorContainer) {
        this.interactiveRanges = []
        this.clearNativeHighlights()
        return
      }

      const paragraphIndex = this.getParagraphIndex()
      const threads = this.renderedThreads
        .filter(thread => this.highlightedThreadIds.has(thread.id))
        .map(thread => resolveMarginThread(thread, paragraphIndex.list))

      const threadRanges = threads.flatMap(thread => this.buildThreadRanges(thread, paragraphIndex))
      this.interactiveRanges = threadRanges.slice()
      this.applyNativeHighlights(threadRanges)
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

      this.resizeListener = () => {
        this.scheduleRefresh()
      }
      window.addEventListener('resize', this.resizeListener)

      const container = this.getEditorContainer()
      if (container) {
        this.scrollContainer = container

        this.clickListener = event => {
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

        container.addEventListener('click', this.clickListener, true)

        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => {
            this.scheduleRefresh()
          })
          this.resizeObserver.observe(container)
        }
      }
    },

    detachListeners () {
      if (this.resizeListener) {
        window.removeEventListener('resize', this.resizeListener)
        this.resizeListener = null
      }

      if (this.scrollContainer && this.clickListener) {
        this.scrollContainer.removeEventListener('click', this.clickListener, true)
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
        this.resizeObserver = null
      }
      this.scrollContainer = null
      this.clickListener = null
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
